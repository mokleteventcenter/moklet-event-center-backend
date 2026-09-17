import { BadRequestException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';

export function resolveGroupKey(
  mode: string,
  student: { classId: string; angkatan: number | null },
): string | null {
  switch (mode) {
    case 'FREE':
      return null;
    case 'PER_CLASS':
      return student.classId;
    case 'PER_ANGKATAN':
      if (student.angkatan == null) {
        throw new BadRequestException(
          'Data angkatan siswa belum terisi, hubungi admin',
        );
      }
      return String(student.angkatan);
    default:
      return null;
  }
}

/**
 * Validasi lintas angkatan: di mode PER_CLASS dan PER_ANGKATAN,
 * anggota baru harus punya groupKey yang sama dengan tim.
 */
export function validateGroupKeyMatch(
  teamGroupKey: string | null,
  joinerGroupKey: string | null,
  mode: string,
): void {
  if (mode === 'FREE') return;
  if (teamGroupKey == null || joinerGroupKey == null) return;
  if (teamGroupKey !== joinerGroupKey) {
    const label = mode === 'PER_CLASS' ? 'kelas' : 'angkatan';
    throw new BadRequestException(
      `Cabang lomba ini mengharuskan semua anggota tim dari ${label} yang sama`,
    );
  }
}

/**
 * Cek kuota dan set quotaConfirmed = true jika memenuhi syarat.
 * Dipanggil DALAM transaction setelah menambah anggota ke tim.
 *
 * Returns true jika quotaConfirmed berubah dari false → true.
 */
export async function checkAndConfirmQuota(
  tx: Prisma.TransactionClient,
  teamId: string,
  category: {
    id: string;
    teamCompositionMode: string;
    maxTeamsPerGroup: number | null;
    maxTotalTeams: number | null;
    minMember: number;
  },
  currentMemberCount: number,
): Promise<boolean> {
  if (currentMemberCount < category.minMember) return false;

  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${category.id}))) AS _lock`;

  const team = await tx.team.findUniqueOrThrow({
    where: { id: teamId },
    select: { quotaConfirmed: true, groupKey: true, categoryId: true },
  });

  if (team.quotaConfirmed) return false;

  if (category.maxTotalTeams != null) {
    const globalConfirmedCount = await tx.team.count({
      where: { categoryId: team.categoryId, quotaConfirmed: true },
    });
    if (globalConfirmedCount >= category.maxTotalTeams) {
      throw new BadRequestException(
        `Kuota total untuk cabang lomba ini sudah penuh (${globalConfirmedCount}/${category.maxTotalTeams})`,
      );
    }
  }

  if (
    category.teamCompositionMode === 'FREE' ||
    category.maxTeamsPerGroup == null
  ) {
    await tx.team.update({
      where: { id: teamId },
      data: { quotaConfirmed: true },
    });
    return true;
  }

  const confirmedCount = await tx.team.count({
    where: {
      categoryId: team.categoryId,
      groupKey: team.groupKey,
      quotaConfirmed: true,
    },
  });

  if (confirmedCount >= category.maxTeamsPerGroup) {
    throw new BadRequestException(
      `Kuota tim untuk grup ini sudah penuh (${confirmedCount}/${category.maxTeamsPerGroup})`,
    );
  }

  await tx.team.update({
    where: { id: teamId },
    data: { quotaConfirmed: true },
  });
  return true;
}
