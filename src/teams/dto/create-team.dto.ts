import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({
    description: 'Nama tim lomba yang dibuat oleh leader',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3, { message: 'Nama tim minimal 3 karakter' })
  @MaxLength(50, { message: 'Nama tim maksimal 50 karakter' })
  name: string;

  @ApiProperty({ description: 'Category.id — harus maxMember > 1' })
  @IsUUID()
  categoryId: string;
}
