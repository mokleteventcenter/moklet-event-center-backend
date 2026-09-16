import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreatePanitiaDto {
  @ApiProperty({
    example: 'osis@gmail.com',
    description:
      'Boleh domain email apa saja, cukup email yang aktif dipakai panitia tsb.',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    minLength: 8,
    description: 'Ditentukan oleh Admin Kesiswaan, bukan panitia sendiri.',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
