import type { AppConfigPort } from './config.port';
import path from 'node:path';
import { DEFAULT_MAX_UPLOAD_BYTES } from '@walker/shared';

/** 从环境变量读取配置（可替换实现） */
export class EnvConfigAdapter implements AppConfigPort {
  private readonly workRootDir: string;
  private readonly workMaxUploadBytes: number;

  constructor() {
    const configuredRoot = process.env.WORK_ROOT_DIR?.trim();
    this.workRootDir = path.resolve(
      configuredRoot || path.resolve(process.cwd(), '../../var/works'),
    );
    const configuredBytes = Number(process.env.WORK_MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);
    this.workMaxUploadBytes = Number.isFinite(configuredBytes) && configuredBytes > 0
      ? configuredBytes
      : DEFAULT_MAX_UPLOAD_BYTES;
  }

  getDatabaseUrl(): string | undefined {
    // 显式强制不可写（验收用；避免 Prisma 自动加载 .env 干扰）
    if (process.env.STORAGE_UNAVAILABLE === 'true') return undefined;
    const url = process.env.DATABASE_URL?.trim();
    return url && url.length > 0 ? url : undefined;
  }

  isAiEnabled(): boolean {
    return process.env.AI_ENABLED === 'true';
  }

  getHost(): string {
    return process.env.HOST?.trim() || '127.0.0.1';
  }

  getPort(): number {
    const port = Number(process.env.PORT ?? 8788);
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : 8788;
  }

  getNodeEnv(): string {
    return process.env.NODE_ENV ?? 'development';
  }

  getWorkRootDir(): string { return this.workRootDir; }

  getWorkMaxUploadBytes(): number { return this.workMaxUploadBytes; }
}
