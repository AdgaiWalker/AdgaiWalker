import { Global, Module } from '@nestjs/common';
// Database DI 已并入 KernelModule（PrismaAdapter 实现 DatabasePort）
@Global()
@Module({})
export class DatabaseModule {}
