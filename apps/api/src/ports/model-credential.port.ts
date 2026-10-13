/**
 * 模型凭据存储（R24 闭环的前置）。
 *
 * 为什么不用 dsh 的 `.credentials.yaml`：实测 dsh 0.1.5-rc.3 的 sdk profile
 * **只要 home 里存在该文件就启动失败**（JSON-RPC -32603 / cannot create effect on
 * inactive context），所以凭据值不能落在那里。
 *
 * 这里用的是 dsh 凭据缝支持的另一条通道：**环境变量 provider**。
 * settings.yaml 仍持有「引用名」，值由本存储持有，运行时读出来注入子进程环境变量——
 * 与 dsh「settings 持引用、provider 持值」的设计一致。
 */
export const MODEL_CREDENTIAL = Symbol('MODEL_CREDENTIAL');

export interface ModelCredentialPort {
  /** 该引用是否有值（不返回值的形状，避免误用）。 */
  has(ref: string): boolean;
  /** 读凭据值；没有则 null。调用方不得记录返回值。 */
  read(ref: string): string | null;
  /** 写入或更新一个引用；返回是否发生了变化。 */
  write(ref: string, value: string): boolean;
  /** 删除一个引用；返回是否删掉了。 */
  remove(ref: string): boolean;
  /** 存储位置（排错用，非密钥）。 */
  location(): string;
}
