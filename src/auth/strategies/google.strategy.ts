import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import {
  Strategy,
  StrategyOptions,
  VerifyCallback,
} from 'passport-google-oauth20';

export interface GoogleProfilePayload {
  email: string;
  name: string;
  hd?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly allowedHd: string;

  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    } as StrategyOptions);

    this.allowedHd = config.get<string>('GOOGLE_ALLOWED_HD')!;
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const email: string | undefined = profile?.emails?.[0]?.value;
    const name: string = profile?.displayName ?? '';
    const hd: string | undefined = profile?._json?.hd;

    if (!email) {
      return done(
        new UnauthorizedException('Email tidak ditemukan dari Google'),
        false,
      );
    }

    const domainFromHd = hd;
    const domainFromEmail = email.split('@')[1];

    const isAllowed =
      domainFromHd === this.allowedHd || domainFromEmail === this.allowedHd;

    if (!isAllowed) {
      return done(
        new UnauthorizedException(
          `Hanya email institusi (@${this.allowedHd}) yang diizinkan login`,
        ),
        false,
      );
    }

    const payload: GoogleProfilePayload = { email, name, hd: domainFromHd };
    done(null, payload);
  }
}
