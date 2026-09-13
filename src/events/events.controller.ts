import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Paginated, MessageResponse } from '../common/interceptors/transform.interceptor';
import { FilePipe } from 'src/upload/pipes/file.pipe';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Buat event baru' })
  @ApiCreatedResponse({ description: 'Event berhasil dibuat' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Hanya PANITIA)' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateEventDto) {
    const created = await this.eventsService.create(user.sub, dto);
    return new MessageResponse(created, 'Event berhasil dibuat');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mendapatkan daftar seluruh event (dengan paginasi)' })
  @ApiOkResponse({ description: 'Daftar event berhasil diambil' })
  async findAll(@Query() pagination: PaginationDto) {
    const result = await this.eventsService.findAll(pagination);
    return new Paginated(result.data, result.meta);
  }

  @Get('managed/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mendapatkan event yang dibuat atau dikelola akun saat ini' })
  async findManaged(@CurrentUser() user: JwtPayload) {
    return this.eventsService.findManaged(user.sub, user.studentId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mendapatkan detail event berdasarkan ID' })
  @ApiParam({ name: 'id', description: 'ID unik event' })
  @ApiOkResponse({ description: 'Detail event berhasil ditemukan' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Perbarui informasi detail event' })
  @ApiParam({ name: 'id', description: 'ID unik event' })
  @ApiOkResponse({ description: 'Event berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Bukan panitia pengelola event ini)' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateEventDto,
  ) {
    const updated = await this.eventsService.update(id, user.sub, dto);
    return new MessageResponse(updated, 'Event berhasil diperbarui');
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Perbarui status alur/publikasi event' })
  @ApiParam({ name: 'id', description: 'ID unik event' })
  @ApiOkResponse({ description: 'Status event berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Status baru tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Bukan panitia pengelola event ini)' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateEventStatusDto,
  ) {
    const updated = await this.eventsService.updateStatus(id, user.sub, dto);
    return new MessageResponse(updated, 'Status event berhasil diperbarui');
  }

  @Patch(':id/banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[PANITIA] Upload atau perbarui banner event' })
  @ApiParam({ name: 'id', description: 'ID unik event' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File gambar banner event (Maksimal 3MB, PNG/JPG/JPEG)',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Banner event berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'File tidak valid atau melebihi batas ukuran 3MB' })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Bukan panitia pengelola event ini)' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateBanner(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile(new FilePipe({ maxSizeMb: 3 })) file: Express.Multer.File,
  ) {
    const updated = await this.eventsService.updateBanner(id, user.sub, file);
    return new MessageResponse(updated, 'Banner event berhasil diperbarui');
  }

  @Patch(':id/guidebook')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[PANITIA] Upload atau perbarui berkas buku panduan (guidebook) event' })
  @ApiParam({ name: 'id', description: 'ID unik event' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File dokumen Guidebook dalam format PDF (Maksimal 10MB)',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Guidebook event berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Format file bukan PDF atau melebihi batas ukuran 10MB' })
  @ApiResponse({ status: 403, description: 'Akses ditolak (Bukan panitia pengelola event ini)' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateGuidebook(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile(new FilePipe({ maxSizeMb: 10, allowedMimes: ['application/pdf'] }))
    file: Express.Multer.File,
  ) {
    const updated = await this.eventsService.updateGuidebook(id, user.sub, file);
    return new MessageResponse(updated, 'Guidebook event berhasil diperbarui');
  }
}
