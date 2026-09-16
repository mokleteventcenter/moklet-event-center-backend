import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly isDev: boolean;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL')!;
    this.isDev = this.config.get<string>('NODE_ENV') !== 'production';
  }

  async sendOtp(to: string, code: string, ttlMinutes: number): Promise<void> {
    const subject = 'Kode Verifikasi Moklet Event Hub';
    const text = `Kode OTP kamu: ${code} (berlaku ${ttlMinutes} menit). Jangan bagikan kode ini ke siapa pun.`;

    if (this.isDev) {
      this.logger.log(`[DEV MODE] OTP untuk ${to}: ${code}`);
      return;
    }

    try {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        text,
      });

      if (response.error) {
        this.logger.error(
          `Resend API Error: ${response.error.message}`,
          response.error,
        );
        throw new Error(response.error.message);
      }

      this.logger.log(`OTP email terkirim ke ${to}`);
    } catch (error) {
      this.logger.error(`Gagal kirim OTP ke ${to}:`, error);
      throw error;
    }
  }
}
