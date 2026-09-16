import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateTeamStatusDto {
  @ApiProperty({
    enum: ['DISQUALIFIED'],
    description: 'Hanya PANITIA yang boleh set status ini',
  })
  @IsIn(['DISQUALIFIED'])
  status: 'DISQUALIFIED';
}
