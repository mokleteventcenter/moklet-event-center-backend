import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportResult {
  successCount: number;
  failedCount: number;
  errors: ImportRowError[];
}

export interface SyncRow {
  row: number;
  name: string;
  nis: string;
  grade: string;
  className: string;
}

export interface SyncRowError {
  row: number;
  reason: string;
}

export interface SyncDiffItem {
  nis: string | null;
  name: string;
  fromClass?: string; // Cuma ada untuk 'update'
  toClass: string;
}

export interface SyncWarning {
  studentId: string;
  nis: string | null;
  name: string;
  currentClass: string;
  reason: string;
}

export interface SyncPreviewResult {
  toCreate: SyncDiffItem[];
  toUpdate: SyncDiffItem[];
  toGraduate: SyncDiffItem[]; // Kelas XII yang tidak muncul di file -> otomatis lulus
  warnings: SyncWarning[]; // Kelas X/XI yang tidak muncul di file -> TIDAK dihapus, cuma diperingatkan
  rowErrors: SyncRowError[];
}

export interface ActiveStudentForDiff {
  id: string;
  nis: string | null;
  name: string;
  classId: string;
  class: { grade: string; name: string };
}

const VALID_GRADES = ['X', 'XI', 'XII'];

/**
 * Pure function, tanpa dependency ke Prisma/ExcelJS — bandingkan hasil
 * parsing file (rows) terhadap data aktif di DB (activeStudents), murni di memory.
 * Dipisah agar bisa di-unit-test tanpa perlu mock DB atau file Excel asli.
 */
export function computeSyncDiff(
  rows: (SyncRow & { classId: string })[],
  activeStudents: ActiveStudentForDiff[],
): Omit<SyncPreviewResult, 'rowErrors'> {
  const dbByNis = new Map(
    activeStudents
      .filter((s) => s.nis !== null)
      .map((s) => [s.nis as string, s]),
  );
  const fileNisSet = new Set(rows.map((r) => r.nis));

  const toCreate: SyncDiffItem[] = [];
  const toUpdate: SyncDiffItem[] = [];

  for (const r of rows) {
    const existing = dbByNis.get(r.nis);
    const toClassLabel = `${r.grade} ${r.className}`;

    if (!existing) {
      toCreate.push({ nis: r.nis, name: r.name, toClass: toClassLabel });
    } else if (existing.classId !== r.classId) {
      toUpdate.push({
        nis: r.nis,
        name: r.name,
        fromClass: `${existing.class.grade} ${existing.class.name}`,
        toClass: toClassLabel,
      });
    }
  }

  const toGraduate: SyncDiffItem[] = [];
  const warnings: SyncWarning[] = [];

  for (const s of activeStudents) {
    if (s.nis && fileNisSet.has(s.nis)) continue;

    const classLabel = `${s.class.grade} ${s.class.name}`;
    if (s.class.grade === 'XII') {
      toGraduate.push({
        nis: s.nis,
        name: s.name,
        toClass: 'LULUS',
        fromClass: classLabel,
      });
    } else {
      warnings.push({
        studentId: s.id,
        nis: s.nis,
        name: s.name,
        currentClass: classLabel,
        reason:
          'Siswa ini aktif & bukan kelas XII, tapi tidak muncul di file — kemungkinan file kurang lengkap. TIDAK akan dihapus otomatis.',
      });
    }
  }

  return { toCreate, toUpdate, toGraduate, warnings };
}

@Injectable()
export class StudentsExcelService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet)
      throw new BadRequestException('File Excel kosong / tidak valid');
    return sheet;
  }

  /**
   * Parse file roster dan validasi tiap baris + resolve Class ID-nya.
   * Dipakai bersama oleh previewSync() dan executeSync().
   */
  private async parseSyncRows(buffer: Buffer): Promise<{
    rows: (SyncRow & { classId: string })[];
    rowErrors: SyncRowError[];
  }> {
    const sheet = await this.loadWorksheet(buffer);
    const rowErrors: SyncRowError[] = [];
    const rows: (SyncRow & { classId: string })[] = [];
    const seenNis = new Set<string>();

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const name = String(row.getCell(1).value ?? '').trim();
      const nis = String(row.getCell(2).value ?? '').trim();
      const grade = String(row.getCell(3).value ?? '')
        .trim()
        .toUpperCase();
      const className = String(row.getCell(4).value ?? '').trim();

      if (!name && !nis && !grade && !className) continue;

      if (!name || !nis || !grade || !className) {
        rowErrors.push({ row: rowNumber, reason: 'Ada kolom yang kosong' });
        continue;
      }

      if (seenNis.has(nis)) {
        rowErrors.push({
          row: rowNumber,
          reason: `NIS "${nis}" duplikat DI DALAM file ini`,
        });
        continue;
      }
      seenNis.add(nis);

      if (!VALID_GRADES.includes(grade)) {
        rowErrors.push({
          row: rowNumber,
          reason: `Tingkat "${grade}" tidak valid`,
        });
        continue;
      }

      const kelas = await this.prisma.class.findUnique({
        where: { grade_name: { grade: grade as any, name: className } },
      });
      if (!kelas) {
        rowErrors.push({
          row: rowNumber,
          reason: `Kelas "${grade} ${className}" belum ada di sistem`,
        });
        continue;
      }

      rows.push({
        row: rowNumber,
        name,
        nis,
        grade,
        className,
        classId: kelas.id,
      });
    }

    return { rows, rowErrors };
  }

  /**
   * Bandingkan file roster lengkap terhadap data aktif di DB (Hanya Preview).
   */
  async previewSync(buffer: Buffer): Promise<SyncPreviewResult> {
    const { rows, rowErrors } = await this.parseSyncRows(buffer);

    const activeStudents = await this.prisma.student.findMany({
      where: { deletedAt: null },
      include: { class: true },
    });

    const diff = computeSyncDiff(rows, activeStudents);
    return { ...diff, rowErrors };
  }

  async executeSync(buffer: Buffer): Promise<SyncPreviewResult> {
    const preview = await this.previewSync(buffer);
    const { rows } = await this.parseSyncRows(buffer);
    const rowsByNis = new Map(rows.map((r) => [r.nis, r]));

    await this.prisma.$transaction(async (tx) => {
      for (const item of preview.toCreate) {
        const r = rowsByNis.get(item.nis!)!;
        await tx.student.create({
          data: { name: r.name, nis: r.nis, classId: r.classId },
        });
      }

      for (const item of preview.toUpdate) {
        const r = rowsByNis.get(item.nis!)!;
        await tx.student.update({
          where: { nis: item.nis! },
          data: { classId: r.classId },
        });
      }

      for (const item of preview.toGraduate) {
        await tx.student.update({
          where: { nis: item.nis! },
          data: { deletedAt: new Date() },
        });
      }

      const setting = await tx.systemSetting.findFirst();
      if (setting) {
        const [startYear, endYear] = setting.currentAcademicYear
          .split('/')
          .map(Number);
        await tx.systemSetting.update({
          where: { id: setting.id },
          data: {
            currentTopAngkatan: setting.currentTopAngkatan + 1,
            currentAcademicYear: `${startYear + 1}/${endYear + 1}`,
          },
        });
      }
    });

    return preview;
  }

  /**
   * Import siswa baru (Hanya CREATE, entri duplikat akan di-skip).
   */
  async importNewStudents(buffer: Buffer): Promise<ImportResult> {
    const sheet = await this.loadWorksheet(buffer);
    const errors: ImportRowError[] = [];
    let successCount = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const name = String(row.getCell(1).value ?? '').trim();
      const nis = String(row.getCell(2).value ?? '').trim();
      const grade = String(row.getCell(3).value ?? '')
        .trim()
        .toUpperCase();
      const className = String(row.getCell(4).value ?? '').trim();

      if (!name && !nis && !grade && !className) continue;

      if (!name || !nis || !grade || !className) {
        errors.push({ row: rowNumber, reason: 'Ada kolom yang kosong' });
        continue;
      }

      if (!VALID_GRADES.includes(grade)) {
        errors.push({
          row: rowNumber,
          reason: `Tingkat "${grade}" tidak valid (harus X/XI/XII)`,
        });
        continue;
      }

      const kelas = await this.prisma.class.findUnique({
        where: { grade_name: { grade: grade as any, name: className } },
      });
      if (!kelas) {
        errors.push({
          row: rowNumber,
          reason: `Kelas "${grade} ${className}" belum ada di sistem — buat dulu lewat menu Kelas`,
        });
        continue;
      }

      const existingNis = await this.prisma.student.findUnique({
        where: { nis },
      });
      if (existingNis) {
        errors.push({ row: rowNumber, reason: `NIS "${nis}" sudah terdaftar` });
        continue;
      }

      await this.prisma.student.create({
        data: { name, nis, classId: kelas.id },
      });
      successCount++;
    }

    return { successCount, failedCount: errors.length, errors };
  }

  /**
   * Export template kesiswaan dalam bentuk buffer excel (.xlsx)
   */
  async exportForPromotion(): Promise<Buffer> {
    const students = await this.prisma.student.findMany({
      where: { deletedAt: null },
      include: { class: true },
      orderBy: [{ class: { grade: 'asc' } }, { name: 'asc' }],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Promosi Kelas');
    sheet.columns = [
      { header: 'NIS', key: 'nis', width: 15 },
      { header: 'Nama (referensi)', key: 'name', width: 30 },
      { header: 'Kelas Sekarang', key: 'currentClass', width: 18 },
      { header: 'Kelas Baru', key: 'newClass', width: 18 },
    ];

    for (const s of students) {
      sheet.addRow({
        nis: s.nis,
        name: s.name,
        currentClass: `${s.class.grade} ${s.class.name}`,
        newClass: '',
      });
    }

    const bufferResult = await workbook.xlsx.writeBuffer();
    return Buffer.from(bufferResult);
  }

  /**
   * Import hasil isian promosi kenaikan kelas massal (2-Pass Validation).
   */
  async importPromotion(buffer: Buffer): Promise<ImportResult> {
    const sheet = await this.loadWorksheet(buffer);
    const errors: ImportRowError[] = [];

    // Pass 1: Baca data & validasi aturan di memory tanpa menulis apapun ke DB terlebih dahulu
    const plannedActions: (
      | { row: number; studentId: string; action: 'graduate' }
      | { row: number; studentId: string; action: 'move'; classId: string }
    )[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const nis = String(row.getCell(1).value ?? '').trim();
      const newClassRaw = String(row.getCell(4).value ?? '').trim();

      if (!nis && !newClassRaw) continue;

      if (!nis || !newClassRaw) {
        errors.push({ row: rowNumber, reason: 'NIS atau Kelas Baru kosong' });
        continue;
      }

      const student = await this.prisma.student.findUnique({ where: { nis } });
      if (!student || student.deletedAt) {
        errors.push({
          row: rowNumber,
          reason: `NIS "${nis}" tidak ditemukan / sudah tidak aktif`,
        });
        continue;
      }

      if (newClassRaw.toUpperCase() === 'LULUS') {
        plannedActions.push({
          row: rowNumber,
          studentId: student.id,
          action: 'graduate',
        });
        continue;
      }

      const [grade, ...nameParts] = newClassRaw.split(' ');
      const className = nameParts.join(' ');
      if (!VALID_GRADES.includes(grade.toUpperCase()) || !className) {
        errors.push({
          row: rowNumber,
          reason: `Format "Kelas Baru" tidak valid: "${newClassRaw}" (contoh benar: "XI RPL 7" or "LULUS")`,
        });
        continue;
      }

      const targetClass = await this.prisma.class.findUnique({
        where: {
          grade_name: { grade: grade.toUpperCase() as any, name: className },
        },
      });
      if (!targetClass) {
        errors.push({
          row: rowNumber,
          reason: `Kelas tujuan "${newClassRaw}" belum ada di sistem — buat dulu lewat menu Kelas`,
        });
        continue;
      }

      plannedActions.push({
        row: rowNumber,
        studentId: student.id,
        action: 'move',
        classId: targetClass.id,
      });
    }

    // Pass 2: Eksekusi seluruh aksi terverifikasi ke dalam basis data lewat single atomic transaction
    await this.prisma.$transaction(async (tx) => {
      for (const action of plannedActions) {
        if (action.action === 'graduate') {
          await tx.student.update({
            where: { id: action.studentId },
            data: { deletedAt: new Date() },
          });
        } else {
          await tx.student.update({
            where: { id: action.studentId },
            data: { classId: action.classId },
          });
        }
      }

      const setting = await tx.systemSetting.findFirst();
      if (setting) {
        const [startYear, endYear] = setting.currentAcademicYear
          .split('/')
          .map(Number);
        await tx.systemSetting.update({
          where: { id: setting.id },
          data: {
            currentTopAngkatan: setting.currentTopAngkatan + 1,
            currentAcademicYear: `${startYear + 1}/${endYear + 1}`,
          },
        });
      }
    });

    return {
      successCount: plannedActions.length,
      failedCount: errors.length,
      errors,
    };
  }
}
