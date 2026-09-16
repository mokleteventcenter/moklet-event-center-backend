import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { EventOwnershipService } from '../event-ownership.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly ownership: EventOwnershipService,
  ) {}

  async create(eventId: string, accountId: string, dto: CreateScheduleDto) {
    await this.ownership.assertCanManage(eventId, accountId);
    return this.prisma.eventSchedule.create({
      data: { ...dto, date: new Date(dto.date), eventId },
    });
  }

  async findAllByEvent(eventId: string) {
    return this.prisma.eventSchedule.findMany({
      where: { eventId },
      orderBy: { date: 'asc' },
    });
  }

  private async findOneOrThrow(id: string) {
    const schedule = await this.prisma.eventSchedule.findUnique({
      where: { id },
    });
    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan');
    return schedule;
  }

  async update(id: string, accountId: string, dto: UpdateScheduleDto) {
    const schedule = await this.findOneOrThrow(id);
    await this.ownership.assertCanManage(schedule.eventId, accountId);
    return this.prisma.eventSchedule.update({
      where: { id },
      data: { ...dto, ...(dto.date && { date: new Date(dto.date) }) },
    });
  }

  async updateDresscodeImage(
    id: string,
    accountId: string,
    file: Express.Multer.File,
  ) {
    const schedule = await this.findOneOrThrow(id);
    await this.ownership.assertCanManage(schedule.eventId, accountId);

    if (schedule.dresscodeImagePublicId) {
      await this.uploadService.deleteFile(
        schedule.dresscodeImagePublicId,
        'image',
      );
    }
    const result = await this.uploadService.uploadFile(
      file,
      'dresscode-images',
      'image',
    );

    return this.prisma.eventSchedule.update({
      where: { id },
      data: {
        dresscodeImageUrl: result.url,
        dresscodeImagePublicId: result.publicId,
      },
    });
  }

  async remove(id: string, accountId: string) {
    const schedule = await this.findOneOrThrow(id);
    await this.ownership.assertCanManage(schedule.eventId, accountId);
    await this.prisma.eventSchedule.delete({ where: { id } });
  }
}
