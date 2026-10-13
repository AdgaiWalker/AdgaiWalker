/**
 * 文件型凭据存储：`<AdgaiWalker DSH_HOME>/credentials.env`。
 *
 * 为什么用 env 文件而不是 YAML：
 * - 与「注入子进程环境变量」这一步同构，少一层格式转换；
 * - 人类可直接读、可手工编辑（站主说过要能自己填）；
 * - 已被 `.gitignore` 覆盖（`apps/api/data/`），明文不进 Git。
 *
 * 只读写 `KEY=value` 形态的行；注释（#）与无关行原样保留，不做整文件重写语义。
 */
import { Injectable } from '@nestjs/common';
import type { ModelCredentialPort } from '../ports/model-credential.port';
import { resolveModelHomeDir } from '../runtime/dsh-home-paths';
import {
  credentialsFilePath,
  readCredential,
  removeCredential,
  writeCredential,
} from '../runtime/dsh-credentials-file';

// 读写与解析统一在 runtime/dsh-credentials-file.ts（运行时与配置界面共用）；
// 此处重导出保持既有 import 不变。
export { credentialsFilePath } from '../runtime/dsh-credentials-file';

@Injectable()
export class FsModelCredential implements ModelCredentialPort {
  private readonly root: string;

  constructor(homeDir: string = resolveModelHomeDir()) {
    this.root = homeDir;
  }

  location(): string {
    return credentialsFilePath(this.root);
  }

  has(ref: string): boolean {
    return readCredential(this.root, ref) !== null;
  }

  read(ref: string): string | null {
    return readCredential(this.root, ref);
  }

  write(ref: string, value: string): boolean {
    return writeCredential(this.root, ref, value);
  }

  remove(ref: string): boolean {
    return removeCredential(this.root, ref);
  }
}
