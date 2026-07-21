import type { PrismaClient } from '@prisma/client';

/** 暴露可写客户端；无配置时 getClient() 为 null */
export interface PrismaPort {
  getClient(): PrismaClient | null;
  isWritable(): boolean;
  ping(): Promise<boolean>;
}

export const PRISMA = Symbol('PRISMA');
