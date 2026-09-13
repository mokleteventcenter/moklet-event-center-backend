import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventOwnershipService } from '../event-ownership.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: EventOwnershipService,
  ) {}

  private assertMinMax(minMember: number, maxMember: number) {
    if (minMember > maxMember) {
      throw new BadRequestException('minMember tidak boleh lebih besar dari maxMember');
    }
  }

  private validateCompositionMode(
    mode: string,
    maxTeamsPerGroup?: number | null,
    maxTotalTeams?: number | null,
  ) {
    if (mode === 'FREE') {
      if (maxTeamsPerGroup != null) {
        throw new BadRequestException('Mode FREE tidak boleh mengisi maxTeamsPerGroup');
      }
    } else {
      if (maxTeamsPerGroup == null) {
        throw new BadRequestException(`maxTeamsPerGroup wajib diisi untuk mode ${mode}`);
      }
      if (maxTotalTeams != null) {
        throw new BadRequestException(`Mode ${mode} tidak boleh mengisi maxTotalTeams (harus pakai FREE)`);
      }
    }
  }

  async create(eventId: string, accountId: string, dto: CreateCategoryDto) {
    await this.ownership.assertCanManage(eventId, accountId);
    this.assertMinMax(dto.minMember, dto.maxMember);
    this.validateCompositionMode(dto.teamCompositionMode, dto.maxTeamsPerGroup, dto.maxTotalTeams);
    return this.prisma.category.create({ data: { ...dto, eventId } });
  }

  async findAllByEvent(eventId: string) {
    return this.prisma.category.findMany({
      where: { eventId },
      include: { _count: { select: { teams: true, registrations: true } } },
    });
  }

  private async findOneOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Kategori/cabang lomba tidak ditemukan');
    return category;
  }

  async findTeams(id: string, accountId: string) {
    const category = await this.findOneOrThrow(id);
    await this.ownership.assertCanManage(category.eventId, accountId);
    return this.prisma.team.findMany({
      where: { categoryId: id },
      include: { teamMembers: { include: { student: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, accountId: string, dto: UpdateCategoryDto) {
    const category = await this.findOneOrThrow(id);
    await this.ownership.assertCanManage(category.eventId, accountId);

    const minMember = dto.minMember ?? category.minMember;
    const maxMember = dto.maxMember ?? category.maxMember;
    this.assertMinMax(minMember, maxMember);

    const mode = dto.teamCompositionMode ?? category.teamCompositionMode;
    const maxPerGroup = dto.maxTeamsPerGroup !== undefined ? dto.maxTeamsPerGroup : category.maxTeamsPerGroup;
    const maxTotal = dto.maxTotalTeams !== undefined ? dto.maxTotalTeams : category.maxTotalTeams;
    
    this.validateCompositionMode(mode, maxPerGroup, maxTotal);

    const updateData = {
      ...dto,
      maxTeamsPerGroup: maxPerGroup,
      maxTotalTeams: maxTotal,
    };

    return this.prisma.category.update({ where: { id }, data: updateData });
  }

  async remove(id: string, accountId: string) {
    const category = await this.findOneOrThrow(id);
    await this.ownership.assertCanManage(category.eventId, accountId);
    // onDelete: Restrict in Registration.categoryId & Team.categoryId
    await this.prisma.category.delete({ where: { id } });
  }
}
