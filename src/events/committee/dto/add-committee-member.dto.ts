import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddCommitteeMemberDto {
  @ApiProperty({
    description:
      'Student.id siswa yang ditambahkan sebagai anggota divisi event ini',
  })
  @IsUUID()
  studentId: string;
}
