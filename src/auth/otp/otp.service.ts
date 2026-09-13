import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { HashingService } from '../../common/hashing/hashing.service';
import { assertStudentDomain } from '../utils/domain.util';
import { randomInt } from 'node:crypto';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class OtpService {
  private readonly length: number;
  private readonly ttlSeconds: number;
  private readonly maxRequestsPerWindow: number;
  private readonly windowSeconds: number;
  private readonly allowedHd: string;

  private readonly requestLog = new Map<string, number[]>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly mailer: MailerService,
  ) {
    this.length = this.config.get<number>('OTP_LENGTH')!;
    this.ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS')!;
    this.maxRequestsPerWindow = this.config.get<number>(
      'OTP_MAX_REQUESTS_PER_WINDOW',
    )!;
    this.windowSeconds = this.config.get<number>('OTP_WINDOW_SECONDS')!;
    this.allowedHd = this.config.get<string>('GOOGLE_ALLOWED_HD')!;
  }

  private checkRateLimit(email: string) {
    const now = Date.now();
    const windowMs = this.windowSeconds * 1000;
    const timestamps = (this.requestLog.get(email) ?? []).filter(
      (t) => now - t < windowMs,
    );

    if (timestamps.length >= this.maxRequestsPerWindow) {
      throw new BadRequestException(
        `Terlalu banyak permintaan OTP. Coba lagi dalam beberapa menit.`,
      );
    }

    timestamps.push(now);
    this.requestLog.set(email, timestamps);
  }

  private generateCode(): string {
    const min = 10 ** (this.length - 1);
    const max = 10 ** this.length - 1;
    return String(randomInt(min, max + 1));
  }

  private async sendCode(email: string): Promise<void> {
    const code = this.generateCode();
    const otpHash = this.hashing.hash(code);
    const otpExpiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const ttlMinutes = Math.floor(this.ttlSeconds / 60);

    await this.mailer.sendOtp(email, code, ttlMinutes);

    await this.prisma.account.update({
      where: { email },
      data: { otpHash, otpExpiresAt },
    });
  }

  async requestOtp(email: string): Promise<void> {
    this.checkRateLimit(email);

    const existing = await this.prisma.account.findUnique({ where: { email } });

    if (!existing) {
      assertStudentDomain(email, this.allowedHd);
      await this.prisma.account.create({ data: { email } });
    }

    await this.sendCode(email);
  }

  async sendCodeIfAccountExists(email: string): Promise<void> {
    this.checkRateLimit(email);
    const existing = await this.prisma.account.findUnique({ where: { email } });
    if (!existing) return;
    if (existing.isActive === false) return;
    await this.sendCode(email);
  }

  async verifyOtp(email: string, code: string): Promise<void> {
    const account = await this.prisma.account.findUnique({ where: { email } });

    if (!account || !account.otpHash || !account.otpExpiresAt) {
      throw new UnauthorizedException('OTP tidak ditemukan, minta kode baru');
    }

    if (account.otpExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('OTP sudah kedaluwarsa, minta kode baru');
    }

    const isValid = this.hashing.verify(code, account.otpHash);
    if (!isValid) {
      throw new UnauthorizedException('Kode OTP salah');
    }

    await this.prisma.account.update({
      where: { email },
      data: { isVerified: true, otpHash: null, otpExpiresAt: null },
    });
  }

  async verifyOtpForPasswordReset(email: string, code: string): Promise<void> {
    const account = await this.prisma.account.findUnique({ where: { email } });

    if (!account || !account.otpHash || !account.otpExpiresAt) {
      throw new UnauthorizedException('OTP tidak ditemukan, minta kode baru');
    }
    if (account.otpExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('OTP sudah kedaluwarsa, minta kode baru');
    }
    const isValid = this.hashing.verify(code, account.otpHash);
    if (!isValid) {
      throw new UnauthorizedException('Kode OTP salah');
    }

    await this.prisma.account.update({
      where: { email },
      data: { otpHash: null, otpExpiresAt: null },
    });
  }
}