import { Controller, Get, Inject } from '@nestjs/common';
import { WorkbenchService } from './workbench.service';

@Controller('workbench')
export class WorkbenchController {
  constructor(@Inject(WorkbenchService) private readonly workbench: WorkbenchService) {}

  @Get()
  get() { return this.workbench.get(); }
}
