import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { EventOwnershipService } from '../events/event-ownership.service';

type SheetSpec = {
  sheetName: string;
  columns: { header: string; key: string; width: number }[];
  rows: Record<string, unknown>[];
};

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: EventOwnershipService,
  ) {}

  private buildWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'excel.worker.js');
      const worker = new Worker(workerPath, { workerData: { sheets } });
      worker.on('message', (buf: Buffer) => {
        worker.terminate();
        resolve(Buffer.from(buf));
      });
      worker.on('error', reject);
    });
  }

  private async collectCategorySheet(categoryId: string): Promise<SheetSpec> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        event: true,
        registrations: {
          include: { student: { include: { class: true, account: true } } },
        },
        teams: {
          include: {
            teamMembers: { include: { student: { include: { class: true, account: true } } } },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Cabang lomba tidak ditemukan');
    }

    let safeSheetName = category.name.replace(/[:\\/?*\[\]]/g, '').substring(0, 31);

    if (safeSheetName.length === 0) {
      safeSheetName = category.id.substring(0, 31);
    }

    const columns: SheetSpec['columns'] = [];
    const rows: Record<string, unknown>[] = [];

    if (category.maxMember === 1) {
      columns.push(
        { header: 'No', key: 'no', width: 5 },
        { header: 'Nama Peserta', key: 'name', width: 30 },
        { header: 'Kelas', key: 'grade', width: 15 },
        { header: 'Kontak / Email', key: 'email', width: 30 },
        { header: 'Waktu Daftar', key: 'registeredAt', width: 20 },
      );

      category.registrations.forEach((reg, index) => {
        rows.push({
          no: index + 1,
          name: reg.student.name,
          grade: reg.student.class.name,
          email: reg.student.account?.email || '-',
          registeredAt: reg.createdAt.toLocaleString('id-ID'),
        });
      });
    } else {
      columns.push(
        { header: 'No', key: 'no', width: 5 },
        { header: 'Kode Tim', key: 'code', width: 12 },
        { header: 'Nama Tim', key: 'teamName', width: 25 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Nama Ketua', key: 'leaderName', width: 25 },
        { header: 'Kelas Ketua', key: 'leaderGrade', width: 15 },
        { header: 'Kontak Ketua', key: 'leaderContact', width: 25 },
      );

      for (let i = 2; i <= category.maxMember; i++) {
        columns.push({ header: `Nama Anggota ${i}`, key: `member${i}Name`, width: 25 });
        columns.push({ header: `Kelas Anggota ${i}`, key: `member${i}Grade`, width: 15 });
      }
      columns.push({ header: 'Waktu Daftar', key: 'registeredAt', width: 20 });

      category.teams.forEach((team, index) => {
        const leader = team.teamMembers.find((m) => m.isLeader);
        const members = team.teamMembers.filter((m) => !m.isLeader);

        const rowData: Record<string, unknown> = {
          no: index + 1,
          code: team.code,
          teamName: team.name,
          status: team.status,
          leaderName: leader ? leader.student.name : '-',
          leaderGrade: leader ? leader.student.class.name : '-',
          leaderContact: leader?.student.account?.email || '-',
          registeredAt: leader ? leader.joinedAt.toLocaleString('id-ID') : '-',
        };

        for (let i = 2; i <= category.maxMember; i++) {
          const member = members[i - 2];
          rowData[`member${i}Name`] = member ? member.student.name : '-';
          rowData[`member${i}Grade`] = member ? member.student.class.name : '-';
        }

        rows.push(rowData);
      });
    }

    return { sheetName: safeSheetName, columns, rows };
  }

  async exportCategoryData(categoryId: string, accountId: string) {
    const categoryLookup = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!categoryLookup) throw new NotFoundException('Cabang lomba tidak ditemukan');

    await this.ownership.assertCanManage(categoryLookup.eventId, accountId);

    const sheet = await this.collectCategorySheet(categoryId);
    const event = await this.prisma.event.findUnique({
      where: { id: categoryLookup.eventId },
    });
    const buffer = await this.buildWorkbook([sheet]);

    await this.prisma.exportLog.create({
      data: {
        categoryId: categoryLookup.id,
        eventId: null,
        exportedById: accountId,
      },
    });

    const cleanEventName = event!.name.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanCatName = categoryLookup.name.replace(/[^a-zA-Z0-9]/g, '_');

    return {
      buffer,
      fileName: `Data_Lomba_${cleanCatName}_${cleanEventName}.xlsx`,
    };
  }

  async exportEventData(eventId: string, accountId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { categories: true },
    });
    if (!event) throw new NotFoundException('Event tidak ditemukan');

    await this.ownership.assertCanManage(eventId, accountId);

    const sheets: SheetSpec[] = [];
    if (event.categories.length === 0) {
      sheets.push({
        sheetName: 'Belum Ada Lomba',
        columns: [{ header: 'Info', key: 'info', width: 40 }],
        rows: [{ info: 'Event ini belum memiliki cabang lomba.' }],
      });
    } else {
      for (const category of event.categories) {
        sheets.push(await this.collectCategorySheet(category.id));
      }
    }

    const buffer = await this.buildWorkbook(sheets);

    await this.prisma.exportLog.create({
      data: {
        categoryId: null,
        eventId: event.id,
        exportedById: accountId,
      },
    });

    const cleanEventName = event.name.replace(/[^a-zA-Z0-9]/g, '_');

    return {
      buffer,
      fileName: `Data_Seluruh_Lomba_${cleanEventName}.xlsx`,
    };
  }
}
