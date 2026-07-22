import { Inject, Injectable } from '@nestjs/common';
import {
  SUPPORT_CONFIG_REPOSITORY,
  type SupportConfig,
  type SupportConfigRepositoryPort,
} from '../ports/support-config.repository';

@Injectable()
export class SupportService {
  constructor(
    @Inject(SUPPORT_CONFIG_REPOSITORY)
    private readonly repo: SupportConfigRepositoryPort,
  ) {}

  get() {
    return this.repo.get();
  }

  save(config: SupportConfig) {
    return this.repo.save(config);
  }
}
