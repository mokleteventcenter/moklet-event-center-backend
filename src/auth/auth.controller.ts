import type { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { BindIdentityDto } from './dto/bind-identity.dto';
import { CreatePanitiaDto } from './dto/create-panitia.dto';
import { UpdatePanitiaStatusDto } from './dto/update-panitia-status.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { VerifyPasswordResetDto } from './dto/verify-password-reset.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  RawResponse,
  MessageResponse,
} from '../common/interceptors/transform.interceptor';
import type { GoogleProfilePayload } from './strategies/google.strategy';

@ApiTags('Autentikasi & Akun (Auth)')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Memicu login menggunakan Google OAuth (siswa)' })
  @ApiResponse({
    status: 302,
    description: 'Mengalihkan pengguna ke halaman login Google.',
  })
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Callback setelah sukses login Google' })
  @ApiOkResponse({
    description: 'Mengembalikan data login awal dan status verifikasi akun.',
  })
  async googleCallback(@CurrentUser() profile: GoogleProfilePayload) {
    const result = await this.authService.handleGoogleLogin(profile);
    return new RawResponse(result);
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register tradisional (email + password) — khusus siswa',
  })
  @ApiOkResponse({
    description: 'Akun dibuat, kode OTP dikirim ke email untuk verifikasi.',
  })
  async register(@Body() dto: RegisterDto) {
    await this.authService.register(dto.email, dto.password);
    return new MessageResponse(
      null,
      'Registrasi berhasil, kode OTP telah dikirim ke email kamu',
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login menggunakan email + password' })
  @ApiOkResponse({ description: 'Login berhasil, mengembalikan JWT.' })
  @ApiResponse({ status: 401, description: 'Email atau password salah.' })
  async login(@Body() dto: LoginDto) {
    const token = await this.authService.login(dto.email, dto.password);
    return new RawResponse({ token });
  }

  @Post('setup-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Setup password (khusus siswa jalur Google, sekali saja)',
  })
  @ApiOkResponse({ description: 'Password berhasil diatur.' })
  @ApiResponse({
    status: 400,
    description: 'Password sudah pernah diatur sebelumnya.',
  })
  async setupPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetupPasswordDto,
  ) {
    await this.authService.setupPassword(user.sub, dto.password);
    return new MessageResponse(null, 'Password berhasil diatur');
  }

  @Post('password/reset-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Minta kode OTP untuk reset password (siswa & panitia)',
  })
  @ApiOkResponse({
    description: 'Jika email terdaftar, kode OTP akan dikirim.',
  })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.authService.requestPasswordReset(dto.email);
    return new MessageResponse(
      null,
      'Jika email terdaftar, kode OTP telah dikirim',
    );
  }

  @Post('password/reset-verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifikasi OTP dan set password baru' })
  @ApiOkResponse({ description: 'Password berhasil diubah.' })
  @ApiResponse({
    status: 401,
    description: 'Kode OTP tidak valid atau kedaluwarsa.',
  })
  async verifyPasswordReset(@Body() dto: VerifyPasswordResetDto) {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return new MessageResponse(
      null,
      'Password berhasil diubah, silakan login kembali',
    );
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Meminta pengiriman kode OTP ke email' })
  @ApiOkResponse({
    description: 'Kode OTP berhasil terkirim ke email siswa/panitia.',
  })
  async requestOtp(@Body() dto: RequestOtpDto) {
    await this.otpService.requestOtp(dto.email);
    return new MessageResponse(null, 'Kode OTP telah dikirim ke email kamu');
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verifikasi kode OTP untuk mendapatkan Access Token (JWT)',
  })
  @ApiOkResponse({
    description:
      'OTP Valid, mengembalikan JWT Token untuk akses fitur aplikasi.',
  })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.otpService.verifyOtp(dto.email, dto.code);
    const token = await this.authService.issueTokenAfterOtpVerified(dto.email);
    return new RawResponse({ token });
  }

  @Post('bind-identity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menghubungkan akun dengan data Siswa (Identity Binding)',
  })
  @ApiOkResponse({
    description:
      'Akun berhasil ditautkan ke identitas siswa. Mengembalikan JWT token baru.',
  })
  @ApiResponse({
    status: 409,
    description: 'Konflik! Siswa sudah terikat dengan akun lain.',
  })
  async bindIdentity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BindIdentityDto,
  ) {
    const updatedAccount = await this.authService.bindIdentity(
      user.sub,
      dto.studentId,
    );

    const newToken = this.authService.issueToken(updatedAccount);

    return new MessageResponse(
      {
        token: newToken,
        account: {
          id: updatedAccount.id,
          email: updatedAccount.email,
          role: updatedAccount.role,
          studentId: updatedAccount.studentId,
        },
      },
      'Berhasil menghubungkan akun ke data siswa',
    );
  }

  @Post('panitia')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Membuat akun panitia baru (Khusus Kesiswaan)',
  })
  @ApiCreatedResponse({
    description: 'Akun panitia berhasil didaftarkan di sistem.',
  })
  async createPanitia(@Body() dto: CreatePanitiaDto) {
    const created = await this.authService.createPanitia(
      dto.email,
      dto.password,
    );
    return new MessageResponse(
      created,
      'Akun panitia dibuat. Panitia bisa langsung login pakai email & password ini.',
    );
  }

  @Get('panitia')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Ambil seluruh daftar akun panitia',
  })
  @ApiOkResponse({ description: 'Daftar akun panitia.' })
  async findAllPanitia() {
    const panitiaList = await this.authService.findAllPanitia();
    return new RawResponse(panitiaList);
  }

  @Patch('panitia/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN_KESISWAAN] Aktifkan / non-aktifkan akun panitia',
  })
  @ApiOkResponse({ description: 'Status akun panitia berhasil diubah.' })
  @ApiResponse({ status: 404, description: 'Akun panitia tidak ditemukan.' })
  async updatePanitiaStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePanitiaStatusDto,
  ) {
    const updated = await this.authService.updatePanitiaStatus(
      id,
      dto.isActive,
    );
    return new MessageResponse(
      updated,
      `Akun panitia berhasil ${dto.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
    );
  }

  @Delete('panitia/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_KESISWAAN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[ADMIN_KESISWAAN] Hapus akun panitia' })
  @ApiOkResponse({ description: 'Akun panitia berhasil dihapus.' })
  @ApiResponse({ status: 404, description: 'Akun panitia tidak ditemukan.' })
  async deletePanitia(@Param('id') id: string) {
    await this.authService.deletePanitia(id);
    return new MessageResponse(null, 'Akun panitia berhasil dihapus');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Mengambil informasi detail akun yang sedang login',
  })
  @ApiOkResponse({
    description: 'Mengembalikan data profil akun beserta relasi data siswanya.',
  })
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }
}
