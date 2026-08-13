import { Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { WORK_EXPORT_SERVICE, WorkExportService } from './export.service';

@Controller('works')
export class ExportController {
  constructor(@Inject(WORK_EXPORT_SERVICE) private readonly exporter: WorkExportService) {}
  @Post(':id/export')
  export(@Param('id') id: string, @Body() body: { destination?: string }) {
    return this.exporter.export(id, body.destination ?? '');
  }
}
