import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
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
import { CommitteeService } from './committee.service';
import { AddCommitteeMemberDto } from './dto/add-committee-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RawResponse,
  MessageResponse,
} from '../../common/interceptors/transform.interceptor';

@ApiTags('Event Committee (Divisi Panitia)')
@Controller('events/:eventId/committee')
export class CommitteeController {
  constructor(private readonly committeeService: CommitteeService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[PANITIA] Tambahkan anggota panitia/divisi baru ke dalam event',
  })
  @ApiParam({ name: 'eventId', description: 'ID unik event yang dikelola' })
  @ApiCreatedResponse({ description: 'Anggota divisi berhasil ditambahkan' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Hanya ketua/pembuat event)',
  })
  @ApiResponse({ status: 404, description: 'Event atau Siswa tidak ditemukan' })
  @ApiResponse({
    status: 409,
    description: 'Siswa sudah terdaftar sebagai anggota panitia di event ini',
  })
  async addMember(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddCommitteeMemberDto,
  ) {
    const created = await this.committeeService.addMember(
      eventId,
      user.sub,
      dto.studentId,
    );
    return new MessageResponse(created, 'Anggota divisi berhasil ditambahkan');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh anggota panitia/divisi di dalam event',
  })
  @ApiParam({ name: 'eventId', description: 'ID unik event' })
  @ApiOkResponse({ description: 'Daftar anggota panitia berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async list(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.committeeService.list(eventId, user.sub);
    return new RawResponse(data);
  }

  @Delete(':studentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[PANITIA] Keluarkan anggota panitia/divisi dari event',
  })
  @ApiParam({ name: 'eventId', description: 'ID unik event' })
  @ApiParam({
    name: 'studentId',
    description: 'ID unik siswa yang akan dikeluarkan dari kepanitiaan',
  })
  @ApiOkResponse({ description: 'Anggota divisi berhasil dikeluarkan' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Hanya ketua/pembuat event)',
  })
  @ApiResponse({
    status: 404,
    description: 'Event atau Anggota panitia tidak ditemukan',
  })
  async removeMember(
    @Param('eventId') eventId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.committeeService.removeMember(eventId, user.sub, studentId);
    return new MessageResponse(null, 'Anggota divisi berhasil dikeluarkan');
  }
}
