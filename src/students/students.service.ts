import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate } from '../common/helpers/paginate.helper';
import { parseStudentEmail, calculateGrade } from './utils/angkatan.util';

export interface BindCandidate {
  studentId: string;
  name: string;
  className: string;
  isSuggested: boolean; // true = kedua token nama (depan & belakang) cocok
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async create(dto: CreateStudentDto) {
    return this.prisma.student.create({ data: dto });
  }

  async findAll(pagination: PaginationDto) {
    const { skip, limit = 20, page = 1 } = pagination;
    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        include: { class: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.student.count({ where: { deletedAt: null } }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { class: true },
    });
    if (!student || student.deletedAt) {
      throw new NotFoundException('Siswa tidak ditemukan');
    }
    return student;
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    return this.prisma.student.update({ where: { id }, data: dto });
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.prisma.student.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async uploadOwnAvatar(accountId: string, file: Express.Multer.File) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { student: true },
    });

    if (!account?.student) {
      throw new BadRequestException(
        'Akun ini belum terhubung ke data siswa (belum bind-identity)',
      );
    }

    if (account.student.photoPublicId) {
      await this.uploadService.deleteFile(
        account.student.photoPublicId,
        'image',
      );
    }

    const result = await this.uploadService.uploadFile(
      file,
      'avatars',
      'image',
    );

    return this.prisma.student.update({
      where: { id: account.student.id },
      data: { photoUrl: result.url, photoPublicId: result.publicId },
    });
  }

  /**
   * Filter kandidat bind-identity dari email siswa yang login.
   * HANYA mengembalikan siswa yang relevan (kelas hasil hitung angkatan
   * + jurusan dari email, DAN minimal satu token nama cocok) — sengaja
   * tidak pernah menampilkan seluruh daftar siswa satu kelas, supaya
   * siswa tidak bisa asal klaim identitas teman sekelasnya.
   */
  async getBindCandidates(email: string): Promise<BindCandidate[]> {
    const parsed = parseStudentEmail(email);
    if (!parsed) return [];

    const setting = await this.prisma.systemSetting.findFirst();
    if (!setting) return [];

    const grade = calculateGrade(parsed.angkatan, setting.currentTopAngkatan);
    if (!grade) return [];

    const candidateClasses = await this.prisma.class.findMany({
      where: {
        grade,
        name: { contains: parsed.jurusanCode, mode: 'insensitive' },
      },
      select: { id: true, grade: true, name: true },
    });

    if (candidateClasses.length === 0) return [];

    const classIds = candidateClasses.map((c) => c.id);
    const classMap = new Map(candidateClasses.map((c) => [c.id, c]));

    const unboundStudents = await this.prisma.student.findMany({
      where: {
        classId: { in: classIds },
        deletedAt: null,
        account: null,
      },
      select: { id: true, name: true, classId: true },
    });

    const results: BindCandidate[] = [];
    for (const student of unboundStudents) {
      const lowerName = student.name.toLowerCase();
      const matchFirst = lowerName.includes(parsed.firstName);
      const matchLast = lowerName.includes(parsed.lastName);

      if (!matchFirst && !matchLast) continue;

      const kelas = classMap.get(student.classId)!;
      results.push({
        studentId: student.id,
        name: student.name,
        className: `${kelas.grade} ${kelas.name}`,
        isSuggested: matchFirst && matchLast,
      });
    }

    return results.sort(
      (a, b) => Number(b.isSuggested) - Number(a.isSuggested),
    );
  }
}
