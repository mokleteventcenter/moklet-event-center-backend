import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * PaginationDto + filter eventId. Diperlukan karena global ValidationPipe
 * memakai forbidNonWhitelisted -- param query di luar DTO akan ditolak 400.
 */
export class FindAllAnnouncementsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by event ID (kosong = semua pengumuman)',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
