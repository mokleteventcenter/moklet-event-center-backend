import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
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
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RawResponse,
  MessageResponse,
} from '../../common/interceptors/transform.interceptor';
import { FilePipe } from 'src/upload/pipes/file.pipe';

@ApiTags('Event Schedules (Dresscode)')
@Controller()
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post('events/:eventId/schedules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Tambah jadwal pelaksanaan event baru' })
  @ApiParam({
    name: 'eventId',
    description: 'ID unik event yang akan ditambahkan jadwalnya',
  })
  @ApiCreatedResponse({ description: 'Jadwal berhasil ditambahkan' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Hanya panitia pengelola event ini)',
  })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async create(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateScheduleDto,
  ) {
    const created = await this.schedulesService.create(eventId, user.sub, dto);
    return new MessageResponse(created, 'Jadwal berhasil ditambahkan');
  }

  @Get('events/:eventId/schedules')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Mendapatkan seluruh jadwal pelaksanaan suatu event',
  })
  @ApiParam({ name: 'eventId', description: 'ID unik event' })
  @ApiOkResponse({ description: 'Daftar jadwal berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async findAllByEvent(@Param('eventId') eventId: string) {
    const data = await this.schedulesService.findAllByEvent(eventId);
    return new RawResponse(data);
  }

  @Patch('schedules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Perbarui detail informasi jadwal event' })
  @ApiParam({ name: 'id', description: 'ID unik jadwal event' })
  @ApiOkResponse({ description: 'Jadwal berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Bukan panitia pengelola event ini)',
  })
  @ApiResponse({ status: 404, description: 'Jadwal tidak ditemukan' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateScheduleDto,
  ) {
    const updated = await this.schedulesService.update(id, user.sub, dto);
    return new MessageResponse(updated, 'Jadwal berhasil diperbarui');
  }

  @Patch('schedules/:id/dresscode-image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[PANITIA] Upload atau perbarui foto contoh dresscode jadwal',
  })
  @ApiParam({ name: 'id', description: 'ID unik jadwal event' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'File gambar dresscode (Maksimal 3MB, Format PNG/JPG/JPEG)',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Gambar dresscode berhasil diperbarui' })
  @ApiResponse({
    status: 400,
    description: 'File tidak valid atau melebihi batas ukuran 3MB',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Bukan panitia pengelola event ini)',
  })
  @ApiResponse({ status: 404, description: 'Jadwal tidak ditemukan' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateDresscodeImage(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile(new FilePipe({ maxSizeMb: 3 })) file: Express.Multer.File,
  ) {
    const updated = await this.schedulesService.updateDresscodeImage(
      id,
      user.sub,
      file,
    );
    return new MessageResponse(updated, 'Gambar dresscode berhasil diperbarui');
  }

  @Delete('schedules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Hapus jadwal dari event' })
  @ApiParam({ name: 'id', description: 'ID unik jadwal yang akan dihapus' })
  @ApiOkResponse({ description: 'Jadwal berhasil dihapus' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Bukan panitia pengelola event ini)',
  })
  @ApiResponse({ status: 404, description: 'Jadwal tidak ditemukan' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.schedulesService.remove(id, user.sub);
    return new MessageResponse(null, 'Jadwal berhasil dihapus');
  }
}
