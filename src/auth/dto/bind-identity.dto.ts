import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class BindIdentityDto {
  @ApiProperty({
    description: 'Student.id yang dipilih dari dropdown unbound-students',
  })
  @IsUUID()
  studentId: string;
}
