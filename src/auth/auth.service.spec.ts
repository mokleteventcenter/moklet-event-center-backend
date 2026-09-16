import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { HashingService } from '../common/hashing/hashing.service';
import { OtpService } from './otp/otp.service';
import { Prisma } from 'generated/prisma/client';

describe('AuthService.bindIdentity', () => {
  let service: AuthService;
  let prisma: {
    account: { findUnique: jest.Mock; update: jest.Mock };
    student: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn(), update: jest.fn() },
      student: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: HashingService, useValue: {} },
        { provide: OtpService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('student.smktelkom-mlg.sch.id'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('menolak kalau Account tidak ditemukan', async () => {
    prisma.account.findUnique.mockResolvedValue(null);

    await expect(service.bindIdentity('acc-1', 'stu-1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('menolak kalau Account sudah pernah bind sebelumnya (studentId sudah terisi)', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      studentId: 'stu-already-bound',
    });

    await expect(service.bindIdentity('acc-1', 'stu-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });

  it('menolak kalau Student tidak ditemukan atau sudah soft-deleted', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      studentId: null,
    });
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      deletedAt: new Date(),
    });

    await expect(service.bindIdentity('acc-1', 'stu-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('berhasil bind ketika semua validasi lolos', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      studentId: null,
    });
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      deletedAt: null,
    });
    prisma.account.update.mockResolvedValue({
      id: 'acc-1',
      studentId: 'stu-1',
    });

    const result = await service.bindIdentity('acc-1', 'stu-1');

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { studentId: 'stu-1' },
    });
    expect(result.studentId).toBe('stu-1');
  });

  it('MELEMPAR ULANG error P2002 tanpa menangkapnya manual — race condition dua akun rebutan Student yang sama harus lolos ke PrismaExceptionFilter (jadi 409)', async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      studentId: null,
    });
    prisma.student.findUnique.mockResolvedValue({
      id: 'stu-1',
      deletedAt: null,
    });

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
    prisma.account.update.mockRejectedValue(p2002Error);

    await expect(service.bindIdentity('acc-1', 'stu-1')).rejects.toBe(
      p2002Error,
    );
  });
});
