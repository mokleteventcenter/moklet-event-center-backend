import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateSystemSettingDto {
  @ApiProperty({
    required: false,
    description: 'Angkatan yang sekarang kelas XII',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  currentTopAngkatan?: number;

  @ApiProperty({ required: false, example: '2026/2027' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}\/\d{4}$/, {
    message: 'Format harus "YYYY/YYYY", mis. "2026/2027"',
  })
  currentAcademicYear?: string;
}
