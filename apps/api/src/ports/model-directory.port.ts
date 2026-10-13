/**
 * 提供方目录（读）。真相源是 dsh 主目录的 settings.yaml（接口段与默认模型）
 * 与 credentials.env（凭据引用名，见 runtime/dsh-credentials-file.ts）。
 * 本端口只做归一化读取，不写文件、不返回密钥值。
 */
import type { AgentHomeView, ModelDirectorySnapshot } from '@walker/shared';

export const MODEL_DIRECTORY = Symbol('MODEL_DIRECTORY');

export interface ModelDirectoryPort {
  /** 读取共享层目录快照。文件缺失或坏形状时 fail-closed（给出接口默认，不猜测）。 */
  snapshot(): ModelDirectorySnapshot;
  /**
   * 读取某个 Agent 的有效环境（R26）：共享层 + 该 Agent 覆盖层合并。
   * 每个 Agent 一个独立 home，模型/提示词/插件各自配置；凭据默认共用。
   */
  agentHome(agentId: string): AgentHomeView;
  /**
   * 取某个凭据引用的值（仅供启动子进程时注入）。
   * 返回 null 表示没有该引用；调用方不得记录返回值。
   */
  credentialValue(ref: string): string | null;
  /** 无秘密的凭据修订：引用名 + 值的变化产生新修订，用于运行时池失效。 */
  credentialRevision(ref: string): string | null;
  /** 目录主目录（排错用）。 */
  homeDir(): string;
}
