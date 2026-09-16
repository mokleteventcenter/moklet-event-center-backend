import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2026-08-17' })
  @IsDateString()
  eventDate: string;

  @ApiProperty({ required: false, description: 'Kontak panitia inti (mis. nomor WA) yang ditampilkan ke peserta' })
  @IsOptional()
  @IsString()
  contactInfo?: string;
}
