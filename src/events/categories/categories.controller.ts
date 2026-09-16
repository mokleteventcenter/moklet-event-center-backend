import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RawResponse,
  MessageResponse,
} from '../../common/interceptors/transform.interceptor';

@ApiTags('Event Categories')
@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post('events/:eventId/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[PANITIA] Tambah cabang lomba/kategori baru ke dalam event',
  })
  @ApiParam({
    name: 'eventId',
    description: 'ID unik event tempat cabang lomba ditambahkan',
  })
  @ApiCreatedResponse({ description: 'Cabang lomba berhasil ditambahkan' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Hanya PANITIA pembuat/pemilik event)',
  })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async create(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCategoryDto,
  ) {
    const created = await this.categoriesService.create(eventId, user.sub, dto);
    return new MessageResponse(created, 'Cabang lomba berhasil ditambahkan');
  }

  @Get('events/:eventId/categories')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Mendapatkan semua daftar cabang lomba di dalam satu event',
  })
  @ApiParam({ name: 'eventId', description: 'ID unik event yang dicari' })
  @ApiOkResponse({ description: 'Daftar cabang lomba berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async findAllByEvent(@Param('eventId') eventId: string) {
    const data = await this.categoriesService.findAllByEvent(eventId);
    return new RawResponse(data);
  }

  @Get('categories/:id/teams')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Mendapatkan tim pada satu cabang lomba' })
  async findTeams(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return new RawResponse(
      await this.categoriesService.findTeams(id, user.sub),
    );
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[PANITIA] Perbarui detail cabang lomba yang sudah ada',
  })
  @ApiParam({ name: 'id', description: 'ID unik cabang lomba/kategori' })
  @ApiOkResponse({ description: 'Cabang lomba berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Bukan panitia pengelola event ini)',
  })
  @ApiResponse({ status: 404, description: 'Cabang lomba tidak ditemukan' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCategoryDto,
  ) {
    const updated = await this.categoriesService.update(id, user.sub, dto);
    return new MessageResponse(updated, 'Cabang lomba berhasil diperbarui');
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PANITIA', 'SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[PANITIA] Hapus cabang lomba dari event' })
  @ApiParam({
    name: 'id',
    description: 'ID unik cabang lomba/kategori yang akan dihapus',
  })
  @ApiOkResponse({ description: 'Cabang lomba berhasil dihapus' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Bukan panitia pengelola event ini)',
  })
  @ApiResponse({ status: 404, description: 'Cabang lomba tidak ditemukan' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.categoriesService.remove(id, user.sub);
    return new MessageResponse(null, 'Cabang lomba berhasil dihapus');
  }
}
