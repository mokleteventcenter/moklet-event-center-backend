import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TeamCompositionMode } from 'generated/prisma/client';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1)
  minMember: number;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1)
  maxMember: number;

  @ApiProperty({
    enum: TeamCompositionMode,
    default: TeamCompositionMode.FREE,
    description: 'Mode komposisi tim untuk cabang lomba ini',
  })
  @IsEnum(TeamCompositionMode)
  teamCompositionMode: TeamCompositionMode;

  @ApiPropertyOptional({
    description:
      'Maksimal tim per grup (kelas/angkatan). Wajib diisi jika mode BUKAN FREE.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTeamsPerGroup?: number;

  @ApiPropertyOptional({
    description: 'Kuota global/total untuk cabang lomba ini secara keseluruhan',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalTeams?: number;

  @ApiPropertyOptional({
    description:
      'Jika true, siswa kelas 12 tidak boleh mendaftar/bergabung di cabang lomba ini (default: true)',
    default: true,
  })
  @IsOptional()
  excludeGrade12?: boolean;
}
