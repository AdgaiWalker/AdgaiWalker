/** 数据库健康探测端口 —— 应用层不依赖 Prisma 具体类 */
export interface DatabasePort {
  /** 探测连通性；无配置或失败返回 false，不抛给调用方 */
  ping(): Promise<boolean>;
}

export const DATABASE = Symbol('DATABASE');
