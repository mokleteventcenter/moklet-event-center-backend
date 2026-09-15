import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HashingService } from '../../common/hashing/hashing.service';
import { MailerService } from '../mailer/mailer.service';

jest.mock('../utils/domain.util', () => ({
  assertStudentDomain: jest.fn(),
}));

describe('OtpService', () => {
  let service: OtpService;
  let prisma: {
    account: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let hashing: { hash: jest.Mock; verify: jest.Mock };
  let mailer: { sendOtp: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    hashing = {
      hash: jest.fn().mockReturnValue('hashed-otp'),
      verify: jest.fn(),
    };
    mailer = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
    };
    config = {
      get: jest.fn((key: string) => {
        const mockEnv: Record<string, string | number> = {
          OTP_LENGTH: 6,
          OTP_TTL_SECONDS: 300,
          OTP_MAX_REQUESTS_PER_WINDOW: 3,
          OTP_WINDOW_SECONDS: 600,
          GOOGLE_ALLOWED_HD: 'test.com',
        };
        return mockEnv[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        { provide: HashingService, useValue: hashing },
        { provide: MailerService, useValue: mailer },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
    // Clear request log before each test
    (
      service as unknown as { requestLog: Map<string, number[]> }
    ).requestLog.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rate Limiting', () => {
    it('throws BadRequestException when rate limit is exceeded', async () => {
      prisma.account.findUnique.mockResolvedValue({ id: 'acc-1' });

      // Request 1
      await service.requestOtp('test@test.com');
      // Request 2
      await service.requestOtp('test@test.com');
      // Request 3
      await service.requestOtp('test@test.com');

      // Request 4 should fail
      await expect(service.requestOtp('test@test.com')).rejects.toThrow(
        BadRequestException,
      );

      // Hanya 3 OTP yang benar-benar dikirim (request ke-4 ditolak)
      expect(mailer.sendOtp).toHaveBeenCalledTimes(3);
    });
  });

  describe('verifyOtp', () => {
    it('throws UnauthorizedException if OTP is expired', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        otpHash: 'hashed-otp',
        otpExpiresAt: new Date(Date.now() - 10000), // Expired 10s ago
      });

      await expect(
        service.verifyOtp('test@test.com', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if OTP is incorrect', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        otpHash: 'hashed-otp',
        otpExpiresAt: new Date(Date.now() + 10000), // Valid
      });
      hashing.verify.mockReturnValue(false);

      await expect(
        service.verifyOtp('test@test.com', 'wrong-code'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates account correctly if OTP is valid', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'acc-1',
        otpHash: 'hashed-otp',
        otpExpiresAt: new Date(Date.now() + 10000), // Valid
      });
      hashing.verify.mockReturnValue(true);

      await service.verifyOtp('test@test.com', '123456');

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
        data: { isVerified: true, otpHash: null, otpExpiresAt: null },
      });
    });
  });

  describe('requestOtp', () => {
    it('mengirim kode OTP via MailerService dan menyimpan hash + expiry ke akun', async () => {
      prisma.account.findUnique.mockResolvedValue({ id: 'acc-1' });

      await service.requestOtp('test@test.com');

      expect(mailer.sendOtp).toHaveBeenCalledWith(
        'test@test.com',
        expect.any(String),
        5,
      );
      const calls = prisma.account.update.mock.calls as Array<
        [
          {
            where: { email: string };
            data: { otpHash: string; otpExpiresAt: Date };
          },
        ]
      >;
      const updateArgs = calls[0][0];
      expect(updateArgs.where.email).toBe('test@test.com');
      expect(updateArgs.data.otpHash).toBe('hashed-otp');
      expect(updateArgs.data.otpExpiresAt.getTime()).toBeGreaterThan(
        Date.now() - 1000,
      );
      expect(updateArgs.data.otpExpiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 300_000,
      );
    });

    it('membuat akun baru untuk email yang belum terdaftar', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await service.requestOtp('baru@test.com');

      expect(prisma.account.create).toHaveBeenCalledWith({
        data: { email: 'baru@test.com' },
      });
      expect(mailer.sendOtp).toHaveBeenCalledWith(
        'baru@test.com',
        expect.any(String),
        5,
      );
    });
  });
});
