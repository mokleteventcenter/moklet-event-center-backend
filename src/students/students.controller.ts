import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
  ApiBody,
} from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { StudentsExcelService } from './students-excel.service';
import { AuthService } from '../auth/auth.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { BindManualDto } from './dto/bind-manual.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  Paginated,
  MessageResponse,
  RawResponse,
} from '../common/interceptors/transform.interceptor';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FilePipe } from 'src/upload/pipes/file.pipe';

@ApiTags('Master Data - Siswa')
@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentsExcelService: StudentsExcelService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Tambah siswa baru secara manual',
  })
  @ApiResponse({ status: 201, description: 'Siswa berhasil ditambahkan' })
  async create(@Body() dto: CreateStudentDto) {
    const created = await this.studentsService.create(dto);
    return new MessageResponse(created, 'Siswa berhasil ditambahkan');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Ambil semua data siswa dengan pagination' })
  async findAll(@Query() pagination: PaginationDto) {
    const result = await this.studentsService.findAll(pagination);
    return new Paginated(result.data, result.meta);
  }

  /**
   * HARUS didaftarkan sebelum ':id' supaya tidak ketangkep sebagai
   * param id oleh route findOne di bawah.
   */
  @Get('bind-candidates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Mendapatkan kandidat akun siswa yang bisa ditautkan berdasarkan email saat ini',
  })
  async bindCandidates(@CurrentUser() user: JwtPayload) {
    const candidates = await this.studentsService.getBindCandidates(user.email);
    return new RawResponse(candidates);
  }

  @Get('export-for-promotion')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="promosi-kelas.xlsx"')
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Export template Excel untuk promosi kelas massal',
  })
  @ApiOkResponse({
    description: 'File Excel (.xlsx) berhasil di-generate',
    type: StreamableFile,
  })
  async exportForPromotion(): Promise<StreamableFile> {
    const buffer = await this.studentsExcelService.exportForPromotion();
    return new StreamableFile(buffer);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Import data siswa baru via Excel (Create Only)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File Excel (.xlsx/.xls) berisi data siswa baru',
        },
      },
    },
  })
  async importNewStudents(
    @UploadedFile(
      new FilePipe({
        maxSizeMb: 5,
        allowedMimes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.studentsExcelService.importNewStudents(
      file.buffer,
    );
    return new MessageResponse(
      result,
      `${result.successCount} siswa berhasil ditambahkan, ${result.failedCount} baris gagal`,
    );
  }

  @Post('import-promotion')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Import data promosi/kenaikan kelas massal via Excel',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File Excel promosi kelas hasil export yang sudah diisi',
        },
      },
    },
  })
  async importPromotion(
    @UploadedFile(
      new FilePipe({
        maxSizeMb: 5,
        allowedMimes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.studentsExcelService.importPromotion(file.buffer);
    return new MessageResponse(
      result,
      `Promosi kelas selesai. ${result.successCount} siswa diproses, ${result.failedCount} baris gagal. Tahun ajaran & angkatan sistem sudah dimajukan.`,
    );
  }

  /**
   * Preview roster sync — bandingkan 1 file lengkap (semua siswa aktif,
   * format sama seperti /students/import) terhadap data di DB. TIDAK
   * menulis apa pun, cuma laporan: siapa baru, siapa pindah kelas,
   * siapa otomatis lulus (XII yang hilang dari file), dan peringatan
   * (X/XI yang hilang dari file — kemungkinan file kurang lengkap).
   */
  @Post('sync/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Preview perbandingan file roster lengkap terhadap database sebelum eksekusi sync',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File Excel berisi roster lengkap seluruh siswa aktif',
        },
      },
    },
  })
  async previewSync(
    @UploadedFile(
      new FilePipe({
        maxSizeMb: 5,
        allowedMimes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.studentsExcelService.previewSync(file.buffer);
    return new RawResponse(result);
  }

  /**
   * Eksekusi roster sync beneran. Re-parse file yang sama dari awal
   * (tidak bergantung ke hasil previewSync sebelumnya). Sebaiknya admin
   * selalu cek /sync/preview dulu dengan file yang sama sebelum
   * memanggil ini, karena ini yang beneran create/update/soft-delete +
   * memajukan SystemSetting.
   */
  @Post('sync/execute')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Eksekusi sinkronisasi roster sekolah (Create, Update, Graduate massal)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File Excel roster lengkap yang telah divalidasi',
        },
      },
    },
  })
  async executeSync(
    @UploadedFile(
      new FilePipe({
        maxSizeMb: 5,
        allowedMimes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.studentsExcelService.executeSync(file.buffer);
    return new MessageResponse(
      result,
      `Sync selesai: ${result.toCreate.length} baru, ${result.toUpdate.length} pindah kelas, ${result.toGraduate.length} lulus. ${result.warnings.length} peringatan.`,
    );
  }

  @Patch('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Upload / ubah foto profil milik sendiri' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File gambar avatar (max 3MB)',
        },
      },
    },
  })
  async uploadOwnAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile(new FilePipe({ maxSizeMb: 3 })) file: Express.Multer.File,
  ) {
    const updated = await this.studentsService.uploadOwnAvatar(user.sub, file);
    return new MessageResponse(updated, 'Foto profil berhasil diperbarui');
  }

  /**
   * Jalur eskalasi kalau bind-candidates otomatis tidak menemukan hasil
   * (format email tidak sesuai pola, nama beda ejaan, dsb). Admin yang
   * menautkan manual setelah verifikasi data asli.
   */
  @Patch(':id/bind-manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Tautkan akun user (Account) ke data siswa secara manual oleh Admin',
  })
  async bindManual(@Param('id') studentId: string, @Body() dto: BindManualDto) {
    // Terima accountId ATAU email (UI admin mengizinkan keduanya).
    if (!dto.accountId && !dto.email) {
      throw new BadRequestException(
        'Sertakan accountId (UUID) atau email akun yang mau ditautkan',
      );
    }
    const accountId =
      dto.accountId ??
      (await this.authService.findAccountIdByEmailOrThrow(dto.email!));
    const updated = await this.authService.bindIdentity(accountId, studentId);
    return new MessageResponse(
      updated,
      'Akun berhasil ditautkan manual ke data siswa',
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Mendapatkan detail profil satu siswa berdasarkan ID',
  })
  async findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Perbarui data identitas siswa berdasarkan ID',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    const updated = await this.studentsService.update(id, dto);
    return new MessageResponse(updated, 'Data siswa berhasil diperbarui');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Nonaktifkan / Soft Delete data siswa berdasarkan ID',
  })
  async remove(@Param('id') id: string) {
    await this.studentsService.softDelete(id);
    return new MessageResponse(null, 'Siswa berhasil dinonaktifkan');
  }
}
