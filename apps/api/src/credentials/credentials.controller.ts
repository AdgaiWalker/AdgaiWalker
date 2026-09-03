/**
 * 凭据管理 HTTP
 * 职责：管理端 CRUD。路径不在公网白名单，自动受 AdminTokenMiddleware 保护。
 */
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import type { CredentialPublicRow } from '../ports/credential.repository';
import { CredentialsService } from './credentials.service';

@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  list(): Promise<CredentialPublicRow[]> {
    return this.credentials.list();
  }

  @Put()
  upsert(
    @Body() body: { name: string; provider: string; secret: string; note?: string },
  ): Promise<CredentialPublicRow> {
    return this.credentials.upsert(body);
  }

  @Get(':id/reveal')
  reveal(@Param('id') id: string) {
    return this.credentials.reveal(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.credentials.remove(id);
    return { ok: true };
  }
}
