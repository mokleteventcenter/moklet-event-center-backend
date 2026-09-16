import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export async function assertStudentEligible(
  prisma: PrismaService | any,
  studentId: string,
  excludeGrade12: boolean = true,
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: true },
  });

  if (!student || student.deletedAt) {
    throw new BadRequestException(
      'Data siswa tidak valid atau sudah tidak aktif',
    );
  }

  if (excludeGrade12 && student.class.grade === 'XII') {
    throw new ForbiddenException(
      'Siswa kelas XII tidak diperkenankan mengikuti cabang lomba ini',
    );
  }

  return student;
}
