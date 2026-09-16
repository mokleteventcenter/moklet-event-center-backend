import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertStudentEligible } from '../common/helpers/assert-student-eligible';
import {
  resolveGroupKey,
  checkAndConfirmQuota,
} from '../common/helpers/quota.helper';
import { IndividualRegistrationDto } from './dto/individual-registration.dto';
import { randomInt } from 'node:crypto';

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pendaftaran individu -- khusus Category.maxMember === 1.
   *
   * Individu juga kena kuota: diperlakukan sebagai "tim isi 1 orang".
   * Dibungkus transaction supaya quota check konsisten.
   *
   * Di mode PER_CLASS / PER_ANGKATAN: groupKey di-resolve dari data siswa,
   * lalu cek kuota (quotaConfirmed langsung true karena minMember = 1).
   *
   * Anti-daftar-ganda tetap dijaga lewat @@unique([studentId, categoryId]).
   */
  async registerIndividual(studentId: string, dto: IndividualRegistrationDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Cabang lomba tidak ditemukan');

    const student = await assertStudentEligible(
      this.prisma,
      studentId,
      category.excludeGrade12,
    );

    if (category.maxMember > 1) {
      throw new BadRequestException(
        'Cabang lomba ini untuk tim (maxMember>1) -- gunakan POST /teams',
      );
    }

    const groupKey = resolveGroupKey(category.teamCompositionMode, student);

    return this.prisma.$transaction(async (tx) => {
      const code = String(randomInt(100000, 1000000));
      const team = await tx.team.create({
        data: {
          name: student.name,
          code,
          status: 'LOCKED',
          categoryId: dto.categoryId,
          groupKey,
          quotaConfirmed: false,
        },
      });

      await tx.teamMember.create({
        data: { teamId: team.id, studentId, isLeader: true },
      });

      await tx.registration.create({
        data: { studentId, categoryId: dto.categoryId, teamId: team.id },
      });

      await checkAndConfirmQuota(tx, team.id, category, 1);

      return tx.registration.findFirstOrThrow({
        where: { studentId, categoryId: dto.categoryId },
        include: { category: { include: { event: true } }, team: true },
      });
    });
  }

  async findMyRegistrations(studentId: string) {
    const registrations = await this.prisma.registration.findMany({
      where: { studentId },
      include: { category: { include: { event: true } }, team: true },
      orderBy: { createdAt: 'desc' },
    });

    // Model Registration tidak punya kolom status -- status kepesertaan
    // diturunkan dari status Team-nya (individu = "tim isi 1 orang"):
    // - DISQUALIFIED -> panitia mendiskualifikasi tim ini
    // - LOCKED       -> tim sudah dikunci/terkonfirmasi (individu selalu LOCKED)
    // - sisanya      -> dianggap terdaftar aktif
    return registrations.map((reg) => ({
      ...reg,
      status:
        reg.team?.status === 'DISQUALIFIED'
          ? 'DISQUALIFIED'
          : reg.team?.status === 'LOCKED'
            ? 'CONFIRMED'
            : 'REGISTERED',
    }));
  }
}
