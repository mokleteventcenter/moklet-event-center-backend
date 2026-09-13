import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, studentId: true, isActive: true },
    });

    if (!account) {
      throw new UnauthorizedException('Akun tidak ditemukan');
    }

    if (account.isActive === false) {
      throw new UnauthorizedException(
        'Akun telah dinonaktifkan. Hubungi Admin Kesiswaan.',
      );
    }

    return {
      sub: account.id,
      email: account.email,
      role: account.role,
      studentId: account.studentId,
    };
  }
}