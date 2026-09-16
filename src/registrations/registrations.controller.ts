import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { RegistrationsService } from './registrations.service';
import { IndividualRegistrationDto } from './dto/individual-registration.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  MessageResponse,
  RawResponse,
} from '../common/interceptors/transform.interceptor';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

function requireStudentId(user: JwtPayload): string {
  if (!user.studentId) {
    throw new BadRequestException(
      'Akun kamu belum terhubung ke data siswa (bind-identity dulu)',
    );
  }
  return user.studentId;
}

@ApiTags('Registrations')
@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post('individual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[SISWA] Daftar lomba individu/perorangan' })
  @ApiCreatedResponse({ description: 'Berhasil mendaftar ke cabang lomba' })
  @ApiResponse({
    status: 400,
    description:
      'Input data tidak valid / Akun belum di-bind ke data siswa / Syarat pendaftaran tidak terpenuhi (misal: kelas XII)',
  })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Hanya akun role SISWA)',
  })
  @ApiResponse({
    status: 404,
    description: 'Event atau Kategori tidak ditemukan',
  })
  @ApiResponse({
    status: 409,
    description: 'Siswa sudah terdaftar di cabang lomba/event ini',
  })
  async registerIndividual(
    @CurrentUser() user: JwtPayload,
    @Body() dto: IndividualRegistrationDto,
  ) {
    const studentId = requireStudentId(user);
    const registration = await this.registrationsService.registerIndividual(
      studentId,
      dto,
    );
    return new MessageResponse(registration, 'Berhasil mendaftar');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SISWA')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      '[SISWA] Mendapatkan daftar pendaftaran lomba milik siswa yang sedang login',
  })
  @ApiOkResponse({ description: 'Daftar pendaftaran siswa berhasil diambil' })
  @ApiResponse({ status: 400, description: 'Akun belum di-bind ke data siswa' })
  @ApiResponse({
    status: 403,
    description: 'Akses ditolak (Hanya akun role SISWA)',
  })
  async findMine(@CurrentUser() user: JwtPayload) {
    const studentId = requireStudentId(user);
    const data = await this.registrationsService.findMyRegistrations(studentId);
    return new RawResponse(data);
  }
}
