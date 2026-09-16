import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cuma Account yang createdById-nya cocok (ketua event) yang boleh
   * lolos. Dipakai KHUSUS untuk operasi yang hanya boleh dilakukan ketua:
   * - Tambah/hapus committee member
   * - Hapus event
   * - Transfer ownership
   */
  async assertOwner(eventId: string, accountId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event tidak ditemukan');
    if (event.createdById !== accountId) {
      throw new ForbiddenException('Kamu bukan penanggung jawab event ini');
    }
    return event;
  }

  /**
   * Dipakai untuk endpoint WRITE management event yang boleh diakses
   * ketua ATAU committee member. Menggantikan assertOwner di:
   * - Edit event, banner, guidebook, status
   * - Category CRUD
   * - Schedule CRUD
   * - Disqualify teams
   * - Buat announcement event-scoped
   */
  async assertCanManage(eventId: string, accountId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        eventCommitteeMembers: {
          include: { student: { include: { account: true } } },
        },
      },
    });
    if (!event) throw new NotFoundException('Event tidak ditemukan');

    // Ketua event → langsung boleh
    if (event.createdById === accountId) return event;

    // Committee member → boleh manage
    const isCommitteeMember = event.eventCommitteeMembers.some(
      (m) => m.student.account?.id === accountId,
    );
    if (!isCommitteeMember) {
      throw new ForbiddenException(
        'Kamu tidak punya akses untuk mengelola event ini',
      );
    }
    return event;
  }

  /**
   * Dipakai untuk endpoint read-only yang boleh diakses ketua ATAU
   * anggota divisi yang sudah ditambahkan ke event tersebut (mis. lihat
   * daftar pendaftar) — sama dengan assertCanManage tapi intent-nya beda
   * (read vs write), dipisah untuk clarity.
   */
  async assertOwnerOrCommitteeMember(eventId: string, accountId: string) {
    return this.assertCanManage(eventId, accountId);
  }
}
