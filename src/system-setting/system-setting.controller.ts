import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { SystemSettingService } from './system-setting.service';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MessageResponse } from '../common/interceptors/transform.interceptor';

@ApiTags('System Setting')
@Controller('system-setting')
export class SystemSettingController {
  constructor(private readonly systemSettingService: SystemSettingService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Mendapatkan konfigurasi aktif sistem saat ini (Tahun Ajaran & Angkatan Teratas)',
  })
  @ApiOkResponse({ description: 'Data SystemSetting berhasil diambil' })
  async get() {
    return this.systemSettingService.get();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[ADMIN_KESISWAAN] Perbarui konfigurasi aktif sistem secara manual',
  })
  @ApiOkResponse({ description: 'SystemSetting berhasil diperbarui' })
  @ApiResponse({ status: 400, description: 'Input data tidak valid' })
  async update(@Body() dto: UpdateSystemSettingDto) {
    const updated = await this.systemSettingService.update(dto);
    return new MessageResponse(updated, 'SystemSetting berhasil diperbarui');
  }
}
