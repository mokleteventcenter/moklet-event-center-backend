import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class BindManualDto {
  @ApiPropertyOptional({
    description: 'Account.id siswa yang mau di-bind manual oleh admin',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    description: 'Email akun siswa (alternatif dari accountId)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
