import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { LeaveTeamDto } from './dto/leave-team.dto';
import { UpdateTeamStatusDto } from './dto/update-team-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessageResponse } from '../common/interceptors/transform.interceptor';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

function requireStudentId(user: JwtPayload): string {
  if (!user.studentId) {
    throw new BadRequestException(
      'Akun kamu belum terhubung ke data siswa (bind-identity dulu)',
    );
  }
  return user.studentId;
}

@ApiTags('Teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[SISWA] Buat tim baru untuk kelompok lomba (User otomatis jadi leader)',
  })
  @ApiCreatedResponse({
    description: 'Tim berhasil dibuat, pembuat otomatis menjadi leader',
  })
  @ApiResponse({
    status: 400,
    description:
      'Input data tidak valid / Akun belum di-bind ke data siswa / Syarat pendaftaran tidak terpenuhi',
  })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Hanya role SISWA)' })
  @ApiResponse({
    status: 409,
    description: 'Siswa sudah terdaftar di tim/kategori lomba ini',
  })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTeamDto) {
    const studentId = requireStudentId(user);
    const created = await this.teamsService.create(studentId, dto);
    return new MessageResponse(
      created,
      'Tim berhasil dibuat, kamu jadi leader',
    );
  }

  @Post('join')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[SISWA] Bergabung ke tim yang sudah ada menggunakan kode tim',
  })
  @ApiCreatedResponse({ description: 'Berhasil bergabung ke dalam tim' })
  @ApiResponse({
    status: 400,
    description:
      'Kode tim tidak valid / Akun belum di-bind ke data siswa / Kuota tim sudah penuh',
  })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Hanya role SISWA)' })
  @ApiResponse({ status: 404, description: 'Kode tim tidak ditemukan' })
  @ApiResponse({
    status: 409,
    description:
      'Tim sudah dikunci atau siswa sudah memiliki tim di kategori ini',
  })
  async join(@CurrentUser() user: JwtPayload, @Body() dto: JoinTeamDto) {
    const studentId = requireStudentId(user);
    const team = await this.teamsService.join(studentId, dto.code);
    return new MessageResponse(team, 'Berhasil bergabung ke tim');
  }

  @Delete(':id/members/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[SISWA] Keluar dari tim yang diikuti (Self leave)',
  })
  @ApiParam({ name: 'id', description: 'ID unik tim' })
  @ApiOkResponse({ description: 'Berhasil keluar dari tim' })
  @ApiResponse({
    status: 400,
    description:
      'Akun belum di-bind ke data siswa / Leader tidak bisa keluar sebelum transfer kepemimpinan atau hapus tim',
  })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Hanya role SISWA)' })
  @ApiResponse({
    status: 404,
    description: 'Tim tidak ditemukan atau kamu bukan anggota tim ini',
  })
  @ApiResponse({ status: 409, description: 'Tim sudah dikunci' })
  async leave(
    @Param('id') teamId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: LeaveTeamDto,
  ) {
    const studentId = requireStudentId(user);
    const result = await this.teamsService.leave(studentId, teamId, dto);
    return new MessageResponse(result, 'Berhasil keluar dari tim');
  }

  @Patch(':id/lock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[SISWA] Kunci tim agar anggota tidak bisa masuk/keluar lagi (Khusus Leader)',
  })
  @ApiParam({ name: 'id', description: 'ID unik tim' })
  @ApiOkResponse({ description: 'Tim berhasil dikunci' })
  @ApiResponse({
    status: 400,
    description: 'Jumlah anggota belum memenuhi batas minimum tim',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Hanya Leader tim yang berhak mengunci tim)',
  })
  @ApiResponse({ status: 404, description: 'Tim tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Tim sudah dalam kondisi dikunci' })
  async lock(@Param('id') teamId: string, @CurrentUser() user: JwtPayload) {
    const studentId = requireStudentId(user);
    const team = await this.teamsService.lock(studentId, teamId);
    return new MessageResponse(team, 'Tim berhasil dikunci');
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Mendiskualifikasi tim dari lomba' })
  @ApiParam({ name: 'id', description: 'ID unik tim' })
  @ApiOkResponse({ description: 'Tim berhasil didiskualifikasi' })
  @ApiResponse({
    status: 403,
    description:
      'Akses ditolak (Hanya panitia pemilik event yang berhak mendiskualifikasi)',
  })
  @ApiResponse({ status: 404, description: 'Tim tidak ditemukan' })
  async updateStatus(
    @Param('id') teamId: string,
    @CurrentUser() user: JwtPayload,
    @Body() _dto: UpdateTeamStatusDto,
  ) {
    const team = await this.teamsService.disqualify(user.sub, teamId);
    return new MessageResponse(team, 'Tim berhasil didiskualifikasi');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Mendapatkan detail informasi tim dan daftar anggotanya',
  })
  @ApiParam({ name: 'id', description: 'ID unik tim' })
  @ApiOkResponse({ description: 'Detail tim berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Tim tidak ditemukan' })
  async findOne(@Param('id') teamId: string) {
    return this.teamsService.findOne(teamId);
  }
}
