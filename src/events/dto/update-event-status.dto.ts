import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class UpdateEventStatusDto {
  @ApiProperty({ enum: ['ONGOING', 'CLOSED'] })
  @IsIn(['ONGOING', 'CLOSED'])
  status: 'ONGOING' | 'CLOSED';
}

/** Query GET /events -- pagination + filter status opsional. */
export class FindAllEventsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['ONGOING', 'CLOSED', 'ALL'],
    default: 'ONGOING',
  })
  @IsOptional()
  @IsIn(['ONGOING', 'CLOSED', 'ALL'])
  status?: 'ONGOING' | 'CLOSED' | 'ALL' = 'ONGOING';
}
