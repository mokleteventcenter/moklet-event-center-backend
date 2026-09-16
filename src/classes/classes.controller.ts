import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { BulkCreateClassDto } from './dto/bulk-create-class.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  Paginated,
  MessageResponse,
} from '../common/interceptors/transform.interceptor';

@ApiTags('Master Data - Kelas')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[ADMIN_KESISWAAN] Buat kelas baru secara manual' })
  @ApiResponse({ status: 201, description: 'Kelas berhasil dibuat' })
  @ApiResponse({
    status: 400,
    description: 'Input tidak valid / kelas sudah ada',
  })
  async create(@Body() dto: CreateClassDto) {
    const created = await this.classesService.create(dto);
    return new MessageResponse(created, 'Kelas berhasil dibuat');
  }

  @Post('bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Buat banyak kelas sekaligus (Bulk Create)',
  })
  @ApiResponse({ status: 201, description: 'Proses bulk create selesai' })
  async bulkCreate(@Body() dto: BulkCreateClassDto) {
    const result = await this.classesService.bulkCreate(dto.classes);
    return new MessageResponse(
      result,
      `${result.successCount} kelas berhasil dibuat, ${result.skippedCount} sudah ada sebelumnya (di-skip)`,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Ambil semua data kelas dengan pagination' })
  async findAll(@Query() pagination: PaginationDto) {
    const result = await this.classesService.findAll(pagination);
    return new Paginated(result.data, result.meta);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dapatkan detail satu kelas berdasarkan ID' })
  @ApiResponse({ status: 404, description: 'Kelas tidak ditemukan' })
  async findOne(@Param('id') id: string) {
    return this.classesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Perbarui data kelas berdasarkan ID',
  })
  @ApiResponse({ status: 200, description: 'Kelas berhasil diperbarui' })
  @ApiResponse({ status: 404, description: 'Kelas tidak ditemukan' })
  async update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    const updated = await this.classesService.update(id, dto);
    return new MessageResponse(updated, 'Kelas berhasil diperbarui');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Hapus data kelas berdasarkan ID',
  })
  @ApiResponse({ status: 200, description: 'Kelas berhasil dihapus' })
  @ApiResponse({ status: 404, description: 'Kelas tidak ditemukan' })
  async remove(@Param('id') id: string) {
    await this.classesService.remove(id);
    return new MessageResponse(null, 'Kelas berhasil dihapus');
  }
}
