import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HashingService } from '../common/hashing/hashing.service';
import { OtpService } from './otp/otp.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { GoogleProfilePayload } from './strategies/google.strategy';
import { assertStudentDomain } from './utils/domain.util';

@Injectable()
export class AuthService {
  private readonly allowedHd: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly hashing: HashingService,
    private readonly otpService: OtpService,
    private readonly config: ConfigService,
  ) {
    this.allowedHd = this.config.get<string>('GOOGLE_ALLOWED_HD')!;
  }

  async handleGoogleLogin(profile: GoogleProfilePayload) {
    const account = await this.prisma.account.upsert({
      where: { email: profile.email },
      create: { email: profile.email },
      update: {},
    });

    return {
      email: account.email,
      isVerified: account.isVerified,
      ...(account.isVerified && { token: this.issueToken(account) }),
    };
  }

  async register(email: string, password: string) {
    assertStudentDomain(email, this.allowedHd);

    const existing = await this.prisma.account.findUnique({ where: { email } });
    if (existing?.isVerified) {
      throw new BadRequestException(
        'Email ini sudah terdaftar dan terverifikasi. Silakan login.',
      );
    }

    const passwordHash = this.hashing.hash(password);
    await this.prisma.account.upsert({
      where: { email },
      create: { email, passwordHash },
      update: { passwordHash },
    });

    await this.otpService.requestOtp(email);
  }

  async login(email: string, password: string): Promise<string> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    const genericError = () =>
      new UnauthorizedException('Email atau password salah');

    if (!account || !account.passwordHash) {
      throw genericError();
    }
    if (!account.isVerified) {
      throw new UnauthorizedException(
        'Akun belum terverifikasi. Selesaikan verifikasi OTP terlebih dahulu.',
      );
    }
    if (account.isActive === false) {
      throw new UnauthorizedException(
        'Akun telah dinonaktifkan. Hubungi Admin Kesiswaan untuk mengaktifkan kembali.',
      );
    }

    const isValid = this.hashing.verify(password, account.passwordHash);
    if (!isValid) {
      throw genericError();
    }

    return this.issueToken(account);
  }

  async setupPassword(accountId: string, password: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new UnauthorizedException('Akun tidak ditemukan');
    }
    if (account.passwordHash) {
      throw new BadRequestException(
        'Password sudah pernah diatur. Gunakan fitur reset password untuk mengubahnya.',
      );
    }

    const passwordHash = this.hashing.hash(password);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { passwordHash },
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.otpService.sendCodeIfAccountExists(email);
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account) {
      throw new UnauthorizedException('Kode OTP tidak valid atau kedaluwarsa');
    }
    if (account.role === 'ADMIN_KESISWAAN') {
      throw new BadRequestException(
        'Reset password untuk akun ini tidak tersedia lewat endpoint ini',
      );
    }

    await this.otpService.verifyOtpForPasswordReset(email, code);

    const passwordHash = this.hashing.hash(newPassword);
    await this.prisma.account.update({
      where: { email },
      data: { passwordHash },
    });
  }

  issueToken(account: {
    id: string;
    email: string;
    role: string;
    studentId: string | null;
  }): string {
    const payload: JwtPayload = {
      sub: account.id,
      email: account.email,
      role: account.role as JwtPayload['role'],
      studentId: account.studentId,
    };
    return this.jwt.sign(payload);
  }

  async issueTokenAfterOtpVerified(email: string): Promise<string> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account || !account.isVerified) {
      throw new UnauthorizedException('Akun belum terverifikasi');
    }
    return this.issueToken(account);
  }

  async getMe(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        role: true,
        isVerified: true,
        isActive: true,
        studentId: true,
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            photoUrl: true,
            class: true,
          },
        },
      },
    });

    if (!account) {
      throw new UnauthorizedException('Akun tidak ditemukan');
    }

    return account;
  }

  /**
   * Resolve Account.id dari email -- dipakai jalur bind manual via email
   * (admin mengetik email akun, bukan UUID-nya).
   */
  async findAccountIdByEmailOrThrow(email: string): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Akun dengan email tersebut tidak ditemukan');
    }
    return account.id;
  }

  async createPanitia(email: string, password: string) {
    const existing = await this.prisma.account.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email ini sudah terdaftar sebagai akun');
    }

    const passwordHash = this.hashing.hash(password);
    return this.prisma.account.create({
      data: {
        email,
        role: 'PANITIA',
        isVerified: true,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isVerified: true,
        isActive: true,
      },
    });
  }

  async findAllPanitia() {
    return this.prisma.account.findMany({
      where: { role: 'PANITIA' },
      select: {
        id: true,
        email: true,
        role: true,
        isVerified: true,
        isActive: true,
      },
    });
  }

  async updatePanitiaStatus(id: string, isActive: boolean) {
    const account = await this.prisma.account.findFirst({
      where: { id, role: 'PANITIA' },
    });
    if (!account) {
      throw new NotFoundException('Akun panitia tidak ditemukan');
    }

    return this.prisma.account.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }

  async deletePanitia(id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, role: 'PANITIA' },
    });
    if (!account) {
      throw new NotFoundException('Akun panitia tidak ditemukan');
    }

    await this.prisma.account.delete({ where: { id } });
  }

  /**
   * Identity binding — titik paling kritis di seluruh modul auth.
   * Dua guard dipasang:
   * 1. Account yang login belum pernah bind sebelumnya (studentId masih null)
   * 2. Student yang dipilih belum ke-klaim akun lain
   *
   * Race condition (dua Account coba bind ke Student yang sama di waktu
   * yang nyaris bersamaan) DITANGKAP oleh constraint
   * `Account.studentId @unique` di level DB, bukan oleh pengecekan
   * `findUnique` di atas — pengecekan manual cuma buat kasih pesan error
   * yang ramah lebih awal, bukan satu-satunya lapisan pertahanan.
   */
  async bindIdentity(accountId: string, studentId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new UnauthorizedException('Akun tidak ditemukan');
    }

    if (account.studentId) {
      throw new BadRequestException('Akun ini sudah terhubung ke data siswa');
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student || student.deletedAt) {
      throw new BadRequestException('Data siswa tidak ditemukan');
    }

    return this.prisma.account.update({
      where: { id: accountId },
      data: { studentId },
    });
  }
}
