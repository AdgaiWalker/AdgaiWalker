import { Controller, Get } from '@nestjs/common';

type CapabilityStatus = 'READY' | 'NOT_IMPLEMENTED';

interface WorkstationCapability {
  key: string;
  status: CapabilityStatus;
}

@Controller('workstation')
export class WorkstationController {
  @Get('health')
  health() {
    return {
      ok: true as const,
      stage: 'SCAFFOLD' as const,
      slice: 'SLICE_1' as const,
    };
  }

  @Get('capabilities')
  capabilities(): { capabilities: WorkstationCapability[] } {
    return {
      capabilities: [
        { key: 'topic-contracts', status: 'READY' },
        { key: 'action-contracts', status: 'READY' },
        { key: 'work-contracts', status: 'READY' },
        { key: 'persistence', status: 'NOT_IMPLEMENTED' },
        { key: 'ai-production', status: 'NOT_IMPLEMENTED' },
        { key: 'publishing', status: 'NOT_IMPLEMENTED' },
      ],
    };
  }
}
