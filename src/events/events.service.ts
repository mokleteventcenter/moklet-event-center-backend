import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EventOwnershipService } from './event-ownership.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate } from '../common/helpers/paginate.helper';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly ownership: EventOwnershipService,
  ) {}

  async create(accountId: string, dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        ...dto,
        eventDate: new Date(dto.eventDate),
        createdById: accountId,
      },
    });
  }

  async findAll(
    pagination: PaginationDto,
    status: 'ONGOING' | 'CLOSED' | 'ALL' = 'ONGOING',
  ) {
    const { skip, limit = 20, page = 1 } = pagination;
    // Default ONGOING (kompatibel dengan perilaku lama); ALL untuk semua
    // status, dipakai mis. halaman riwayat event panitia.
    const where = status === 'ALL' ? {} : { status };
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { eventDate: 'asc' },
        include: {
          // _count pendaftar per kategori (Registration = 1 baris per
          // peserta, individu maupun anggota tim) supaya klien bisa
          // menampilkan jumlah pendaftar tanpa N+1 dan TANPA menjumlah
          // teams + registrations (yang itu double counting).
          categories: {
            select: { _count: { select: { registrations: true } } },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findManaged(accountId: string, studentId?: string | null) {
    return this.prisma.event.findMany({
      where: {
        OR: [
          { createdById: accountId },
          ...(studentId
            ? [{ eventCommitteeMembers: { some: { studentId } } }]
            : []),
        ],
      },
      orderBy: { eventDate: 'asc' },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        categories: {
          include: { _count: { select: { teams: true, registrations: true } } },
        },
        eventSchedules: true,
        _count: { select: { categories: true } },
      },
    });
    if (!event) throw new NotFoundException('Event tidak ditemukan');
    return event;
  }

  async update(id: string, accountId: string, dto: UpdateEventDto) {
    await this.ownership.assertCanManage(id, accountId);
    return this.prisma.event.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.eventDate && { eventDate: new Date(dto.eventDate) }),
      },
    });
  }

  async updateStatus(id: string, accountId: string, dto: UpdateEventStatusDto) {
    await this.ownership.assertCanManage(id, accountId);
    return this.prisma.event.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async updateBanner(id: string, accountId: string, file: Express.Multer.File) {
    const event = await this.ownership.assertCanManage(id, accountId);

    if (event.bannerPublicId) {
      await this.uploadService.deleteFile(event.bannerPublicId, 'image');
    }
    const result = await this.uploadService.uploadFile(
      file,
      'event-banners',
      'image',
    );

    return this.prisma.event.update({
      where: { id },
      data: { bannerUrl: result.url, bannerPublicId: result.publicId },
    });
  }

  async updateGuidebook(
    id: string,
    accountId: string,
    file: Express.Multer.File,
  ) {
    const event = await this.ownership.assertCanManage(id, accountId);

    if (event.guidebookPublicId) {
      await this.uploadService.deleteFile(event.guidebookPublicId, 'raw');
    }
    const result = await this.uploadService.uploadFile(
      file,
      'event-guidebooks',
      'document',
    );

    return this.prisma.event.update({
      where: { id },
      data: { guidebookUrl: result.url, guidebookPublicId: result.publicId },
    });
  }
}
