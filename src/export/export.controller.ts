import { Controller, Get, Param, UseGuards, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Export')
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('categories/:categoryId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Export data pendaftar/tim untuk SATU cabang lomba (1 Sheet Excel)',
  })
  @ApiParam({ name: 'categoryId', description: 'ID unik cabang lomba' })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiResponse({
    status: 200,
    description: 'File Excel berhasil di-generate dan diunduh',
  })
  @ApiResponse({ status: 403, description: 'Bukan panitia dari event terkait' })
  @ApiResponse({ status: 404, description: 'Cabang lomba tidak ditemukan' })
  async exportCategory(
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.exportService.exportCategoryData(
      categoryId,
      user.sub,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Get('events/:eventId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Export data pendaftar/tim untuk SELURUH lomba dalam satu event (Multi-Sheet Excel)',
  })
  @ApiParam({ name: 'eventId', description: 'ID unik event' })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiResponse({
    status: 200,
    description: 'File Excel multi-sheet berhasil di-generate dan diunduh',
  })
  @ApiResponse({ status: 403, description: 'Bukan panitia dari event ini' })
  @ApiResponse({ status: 404, description: 'Event tidak ditemukan' })
  async exportEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.exportService.exportEventData(
      eventId,
      user.sub,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
