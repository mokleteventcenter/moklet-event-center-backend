import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventOwnershipService } from '../events/event-ownership.service';
import { assertStudentEligible } from '../common/helpers/assert-student-eligible';
import {
  resolveGroupKey,
  validateGroupKeyMatch,
  checkAndConfirmQuota,
} from '../common/helpers/quota.helper';
import { CreateTeamDto } from './dto/create-team.dto';
import { LeaveTeamDto } from './dto/leave-team.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: EventOwnershipService,
  ) {}

  private async generateUniqueCode(): Promise<string> {
    // Retry loop -- 6 digit numerik, ~900rb kombinasi (100000-999999),
    // tabrakan sangat jarang tapi tetap dijaga dengan re-roll.
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(randomInt(100000, 1000000));
      const existing = await this.prisma.team.findUnique({ where: { code } });
      if (!existing) return code;
    }
    throw new BadRequestException('Gagal generate kode tim, coba lagi');
  }

  /**
   * Create team + daftarkan leader, dalam SATU transaction. Kalau salah
   * satu langkah gagal (mis. constraint anti-daftar-ganda kena), semua
   * rollback -- tidak ada Team yatim tanpa leader.
   *
   * Quota logic (anti-troll):
   * - Tim dibuat dengan quotaConfirmed = false
   * - Begitu jumlah anggota capai minMember, cek kuota groupKey
   * - Kalau slot masih ada → quotaConfirmed = true (one-way flag)
   * - Kalau slot penuh → tolak (rollback seluruh transaction)
   */
  async create(studentId: string, dto: CreateTeamDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Cabang lomba tidak ditemukan');

    const student = await assertStudentEligible(
      this.prisma,
      studentId,
      category.excludeGrade12,
    );

    if (category.maxMember <= 1) {
      throw new BadRequestException(
        'Cabang lomba ini untuk individu (maxMember=1) -- gunakan POST /registrations/individual',
      );
    }

    const groupKey = resolveGroupKey(category.teamCompositionMode, student);
    const code = await this.generateUniqueCode();

    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: dto.name,
          code,
          status: 'OPEN',
          categoryId: dto.categoryId,
          groupKey,
          quotaConfirmed: false,
        },
      });

      await tx.teamMember.create({
        data: { teamId: team.id, studentId, isLeader: true },
      });

      // Unique constraint @@unique([studentId, categoryId]) di sini yang
      // jadi baris pertahanan anti-daftar-ganda -- kalau siswa sudah
      // terdaftar di cabang lomba ini (entah individu atau tim lain),
      // insert ini gagal P2002 dan seluruh transaction rollback (team +
      // teamMember yang baru dibuat ikut batal, bukan nyangkut yatim).
      await tx.registration.create({
        data: { studentId, categoryId: dto.categoryId, teamId: team.id },
      });

      // Cek kuota setelah leader masuk (1 anggota)
      // Kalau minMember = 1, langsung cek kuota & confirm
      await checkAndConfirmQuota(tx, team.id, category, 1);

      return tx.team.findUniqueOrThrow({
        where: { id: team.id },
        include: { teamMembers: true },
      });
    });
  }

  /**
   * TITIK PALING KRITIS: join tim by code. Row lock (SELECT ... FOR
   * UPDATE) dalam transaction supaya dua siswa yang join bersamaan pada
   * slot terakhir tidak sama-sama lolos melebihi maxMember.
   *
   * Di mode PER_CLASS / PER_ANGKATAN:
   * - Validasi groupKey cocok (anggota baru harus dari kelas/angkatan yang sama)
   * - Cek kuota saat anggota memenuhi minMember
   */
  async join(studentId: string, code: string) {
    const teamLookup = await this.prisma.team.findUnique({
      where: { code },
      include: { category: true },
    });
    if (!teamLookup) throw new NotFoundException('Kode tim tidak ditemukan');

    const student = await assertStudentEligible(
      this.prisma,
      studentId,
      teamLookup.category.excludeGrade12,
    );

    const teamId = teamLookup.id;

    return this.prisma.$transaction(async (tx) => {
      // Row lock -- baris Team ini terkunci sampai transaction ini
      // selesai, request join lain untuk tim yang sama akan menunggu
      // giliran, bukan sama-sama baca data stale dan sama-sama lolos.
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;

      const team = await tx.team.findUniqueOrThrow({
        where: { id: teamId },
        include: { category: true, teamMembers: true },
      });

      if (team.status === 'LOCKED') {
        throw new BadRequestException(
          'Tim ini sudah dikunci oleh leader, tidak bisa join lagi',
        );
      }
      if (team.status === 'FULL') {
        throw new BadRequestException('Tim ini sudah penuh');
      }
      if (team.status === 'DISQUALIFIED') {
        throw new BadRequestException('Tim ini sudah didiskualifikasi');
      }

      const currentCount = team.teamMembers.length;
      if (currentCount >= team.category.maxMember) {
        // Safety net kalau status somehow belum sempat di-flip FULL.
        throw new BadRequestException('Tim ini sudah penuh');
      }

      // Validasi groupKey: di mode terbatas, anggota baru harus dari
      // kelas/angkatan yang sama dengan tim
      const joinerGroupKey = resolveGroupKey(
        team.category.teamCompositionMode,
        student,
      );
      validateGroupKeyMatch(
        team.groupKey,
        joinerGroupKey,
        team.category.teamCompositionMode,
      );

      await tx.teamMember.create({
        data: { teamId, studentId, isLeader: false },
      });

      // Sama seperti create(): unique constraint di sini yang jadi
      // pertahanan anti-daftar-ganda utama.
      await tx.registration.create({
        data: { studentId, categoryId: team.categoryId, teamId },
      });

      const newCount = currentCount + 1;

      // Cek kuota: kalau ini anggota yang ke-minMember, cek & confirm kuota
      await checkAndConfirmQuota(tx, teamId, team.category, newCount);

      if (newCount >= team.category.maxMember) {
        await tx.team.update({
          where: { id: teamId },
          data: { status: 'FULL' },
        });
      }

      return tx.team.findUniqueOrThrow({
        where: { id: teamId },
        include: { teamMembers: true },
      });
    });
  }

  /**
   * Leave team. Leadership TIDAK otomatis ditebak sistem -- kalau yang
   * leave adalah leader dan tim masih ada anggota lain, WAJIB tunjuk
   * pengganti eksplisit lewat newLeaderStudentId.
   *
   * quotaConfirmed TETAP true meskipun anggota berkurang di bawah
   * minMember (one-way flag). Slot kuota baru lepas kalau tim dihapus total.
   */
  async leave(studentId: string, teamId: string, dto: LeaveTeamDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;

      const team = await tx.team.findUnique({
        where: { id: teamId },
        include: { teamMembers: true },
      });
      if (!team) throw new NotFoundException('Tim tidak ditemukan');

      if (team.status === 'LOCKED') {
        throw new BadRequestException(
          'Tim sudah dikunci, tidak bisa keluar tanpa intervensi panitia',
        );
      }
      if (team.status === 'DISQUALIFIED') {
        throw new BadRequestException('Tim sudah didiskualifikasi');
      }

      const myMembership = team.teamMembers.find(
        (m) => m.studentId === studentId,
      );
      if (!myMembership)
        throw new NotFoundException('Kamu bukan anggota tim ini');

      const remainingMembers = team.teamMembers.filter(
        (m) => m.studentId !== studentId,
      );

      if (myMembership.isLeader && remainingMembers.length > 0) {
        if (!dto.newLeaderStudentId) {
          throw new BadRequestException(
            'Kamu leader tim ini -- tentukan pengganti (newLeaderStudentId) sebelum keluar',
          );
        }
        const successor = remainingMembers.find(
          (m) => m.studentId === dto.newLeaderStudentId,
        );
        if (!successor) {
          throw new BadRequestException(
            'Calon leader baru harus anggota tim yang sama',
          );
        }
        await tx.teamMember.update({
          where: { id: successor.id },
          data: { isLeader: true },
        });
      }

      // Hapus TeamMember DAN Registration -- begitu keluar, siswa ini
      // tidak lagi terdaftar di cabang lomba ini sama sekali (bukan cuma
      // keluar dari tim, tapi juga lepas dari Registration-nya).
      await tx.teamMember.delete({ where: { id: myMembership.id } });
      await tx.registration.deleteMany({
        where: { studentId, categoryId: team.categoryId, teamId },
      });

      if (remainingMembers.length === 0) {
        // Tim kosong -- hapus sekalian, kode tim jadi bebas lagi.
        // quotaConfirmed otomatis lepas karena row Team-nya dihapus.
        await tx.team.delete({ where: { id: teamId } });
        return { deleted: true, teamId };
      }

      // FULL -> OPEN otomatis begitu ada yang keluar dari tim penuh.
      if (team.status === 'FULL') {
        await tx.team.update({
          where: { id: teamId },
          data: { status: 'OPEN' },
        });
      }

      return tx.team.findUniqueOrThrow({
        where: { id: teamId },
        include: { teamMembers: true },
      });
    });
  }

  async lock(studentId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { teamMembers: true, category: true },
    });
    if (!team) throw new NotFoundException('Tim tidak ditemukan');

    const myMembership = team.teamMembers.find(
      (m) => m.studentId === studentId,
    );
    if (!myMembership?.isLeader) {
      throw new ForbiddenException('Cuma leader yang bisa mengunci tim');
    }
    if (team.status !== 'OPEN') {
      throw new BadRequestException('Tim cuma bisa dikunci dari status OPEN');
    }
    if (team.teamMembers.length < team.category.minMember) {
      throw new BadRequestException(
        `Anggota belum memenuhi minimal (${team.teamMembers.length}/${team.category.minMember})`,
      );
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: { status: 'LOCKED' },
    });
  }

  /**
   * Disqualify -- khusus PANITIA/Committee yang manage Event terkait (lewat
   * Category -> Event). Final state, tidak bisa balik ke status lain.
   */
  async disqualify(accountId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { category: true },
    });
    if (!team) throw new NotFoundException('Tim tidak ditemukan');

    await this.ownership.assertCanManage(team.category.eventId, accountId);

    return this.prisma.team.update({
      where: { id: teamId },
      data: { status: 'DISQUALIFIED' },
    });
  }

  async findOne(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        teamMembers: {
          include: {
            student: { select: { id: true, name: true, photoUrl: true } },
          },
        },
        category: true,
      },
    });
    if (!team) throw new NotFoundException('Tim tidak ditemukan');
    return team;
  }
}
