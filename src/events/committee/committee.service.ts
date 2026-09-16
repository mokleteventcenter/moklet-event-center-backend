import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventOwnershipService } from '../event-ownership.service';

@Injectable()
export class CommitteeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: EventOwnershipService,
  ) {}

  /**
   * Cuma ketua event (createdById) yang boleh nambah anggota divisi —
   * konsisten dengan aturan dasar "cuma yang bikin event yang bisa
   * manage event itu". Anggota divisi sendiri TIDAK bisa nambah anggota
   * lain (bukan assertOwnerOrCommitteeMember, tapi assertOwner murni).
   */
  async addMember(eventId: string, accountId: string, studentId: string) {
    await this.ownership.assertOwner(eventId, accountId);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student || student.deletedAt) {
      throw new BadRequestException('Data siswa tidak ditemukan');
    }

    const existing = await this.prisma.eventCommitteeMember.findUnique({
      where: { eventId_studentId: { eventId, studentId } },
    });
    if (existing) {
      throw new BadRequestException(
        'Siswa ini sudah jadi anggota divisi event ini',
      );
    }

    return this.prisma.eventCommitteeMember.create({
      data: { eventId, studentId, addedById: accountId },
    });
  }

  async removeMember(eventId: string, accountId: string, studentId: string) {
    await this.ownership.assertOwner(eventId, accountId);

    const existing = await this.prisma.eventCommitteeMember.findUnique({
      where: { eventId_studentId: { eventId, studentId } },
    });
    if (!existing)
      throw new NotFoundException('Siswa ini bukan anggota divisi event ini');

    await this.prisma.eventCommitteeMember.delete({
      where: { eventId_studentId: { eventId, studentId } },
    });
  }

  /**
   * List anggota divisi boleh dilihat ketua ATAU anggota divisi lain di
   * event yang sama (read-only, transparansi internal panitia).
   */
  async list(eventId: string, accountId: string) {
    await this.ownership.assertOwnerOrCommitteeMember(eventId, accountId);
    return this.prisma.eventCommitteeMember.findMany({
      where: { eventId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            photoUrl: true,
            nis: true,
            class: true,
          },
        },
      },
    });
  }
}
