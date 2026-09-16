import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateAnnouncementDto {
  @ApiProperty({
    description: 'Judul pengumuman',
    example: 'Pengumuman Lomba Futsal',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Isi pengumuman' })
  @IsString()
  @MinLength(10)
  content: string;

  @ApiPropertyOptional({
    description: 'ID event terkait (null = pengumuman global)',
    example: 'uuid-event-id',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
