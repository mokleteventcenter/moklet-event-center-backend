import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  Paginated,
  MessageResponse,
} from '../common/interceptors/transform.interceptor';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Announcements (Pengumuman)')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA', 'PANITIA', 'ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[SISWA/PANITIA/ADMIN_KESISWAAN] Buat pengumuman baru (global atau khusus event)',
    description:
      'Pengumuman global: PANITIA/ADMIN_KESISWAAN. ' +
      'Pengumuman event: ketua event atau committee member.',
  })
  @ApiCreatedResponse({ description: 'Pengumuman berhasil dibuat' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAnnouncementDto,
  ) {
    const created = await this.announcementsService.create(
      user.sub,
      user.role,
      dto,
    );
    return new MessageResponse(created, 'Pengumuman berhasil dibuat');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Daftar pengumuman (dengan pagination & filter event opsional)',
  })
  @ApiQuery({
    name: 'eventId',
    required: false,
    description: 'Filter by event ID',
  })
  @ApiOkResponse({ description: 'Daftar pengumuman berhasil diambil' })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('eventId') eventId?: string,
  ) {
    const result = await this.announcementsService.findAll(pagination, eventId);
    return new Paginated(result.data, result.meta);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Detail pengumuman berdasarkan ID' })
  @ApiParam({ name: 'id', description: 'ID unik pengumuman' })
  @ApiOkResponse({ description: 'Detail pengumuman berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Pengumuman tidak ditemukan' })
  async findOne(@Param('id') id: string) {
    return this.announcementsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA', 'PANITIA', 'ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[SISWA/PANITIA/ADMIN_KESISWAAN] Edit pengumuman' })
  @ApiParam({ name: 'id', description: 'ID unik pengumuman' })
  @ApiOkResponse({ description: 'Pengumuman berhasil diperbarui' })
  @ApiResponse({ status: 403, description: 'Akses ditolak' })
  @ApiResponse({ status: 404, description: 'Pengumuman tidak ditemukan' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    const updated = await this.announcementsService.update(id, user.sub, dto);
    return new MessageResponse(updated, 'Pengumuman berhasil diperbarui');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA', 'PANITIA', 'ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[SISWA/PANITIA/ADMIN_KESISWAAN] Hapus pengumuman' })
  @ApiParam({ name: 'id', description: 'ID unik pengumuman' })
  @ApiOkResponse({ description: 'Pengumuman berhasil dihapus' })
  @ApiResponse({ status: 403, description: 'Akses ditolak' })
  @ApiResponse({ status: 404, description: 'Pengumuman tidak ditemukan' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.announcementsService.remove(id, user.sub);
    return new MessageResponse(null, 'Pengumuman berhasil dihapus');
  }
}
