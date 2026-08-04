import { Module } from '@nestjs/common';
import { WorkstationController } from './workstation.controller';

@Module({
  controllers: [WorkstationController],
})
export class WorkstationModule {}
