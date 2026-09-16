import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventOwnershipService } from '../events/event-ownership.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate } from '../common/helpers/paginate.helper';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: EventOwnershipService,
  ) {}

  async create(accountId: string, role: string, dto: CreateAnnouncementDto) {
    if (dto.eventId) {
      await this.ownership.assertCanManage(dto.eventId, accountId);
    } else {
      if (!['PANITIA', 'ADMIN_KESISWAAN'].includes(role)) {
        throw new ForbiddenException(
          'Hanya PANITIA atau ADMIN_KESISWAAN yang bisa membuat pengumuman global',
        );
      }
    }

    return this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        eventId: dto.eventId ?? null,
        createdById: accountId,
      },
      include: {
        event: { select: { id: true, name: true } },
        createdBy: {
          select: {
            id: true,
            email: true,
            student: { select: { name: true } },
          },
        },
      },
    });
  }

  async findAll(pagination: PaginationDto, eventId?: string) {
    const { skip, limit = 20, page = 1 } = pagination;
    const where = eventId ? { eventId } : {};

    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: { id: true, name: true } },
          createdBy: {
            select: {
              id: true,
              email: true,
              student: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      include: {
        event: { select: { id: true, name: true } },
        createdBy: {
          select: {
            id: true,
            email: true,
            student: { select: { name: true } },
          },
        },
      },
    });
    if (!announcement)
      throw new NotFoundException('Pengumuman tidak ditemukan');
    return announcement;
  }

  async update(id: string, accountId: string, dto: UpdateAnnouncementDto) {
    const announcement = await this.findOne(id);

    if (announcement.eventId) {
      await this.ownership.assertCanManage(announcement.eventId, accountId);
    } else if (announcement.createdById !== accountId) {
      throw new ForbiddenException('Kamu tidak bisa mengedit pengumuman ini');
    }

    return this.prisma.announcement.update({
      where: { id },
      data: dto,
      include: {
        event: { select: { id: true, name: true } },
        createdBy: {
          select: {
            id: true,
            email: true,
            student: { select: { name: true } },
          },
        },
      },
    });
  }

  async remove(id: string, accountId: string) {
    const announcement = await this.findOne(id);

    if (announcement.eventId) {
      await this.ownership.assertCanManage(announcement.eventId, accountId);
    } else if (announcement.createdById !== accountId) {
      throw new ForbiddenException('Kamu tidak bisa menghapus pengumuman ini');
    }

    await this.prisma.announcement.delete({ where: { id } });
  }
}
