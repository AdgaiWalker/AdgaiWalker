/**
 * 从 dsh 主目录读取提供方目录（复用 dsh 原生管理，不自建）。
 *
 * - settings.yaml：提供方接口段（llm-deepseek 等）声明 API 网址、引用名、模型目录；
 *   以及 dsh 自己的 agent-default-model。
 * - credentials.env：**凭据单一真相源**。dsh 0.1.5-rc.3 的 sdk profile 只要 home 里存在
 *   .credentials.yaml 就启动失败，所以凭据值存 credentials.env（见 runtime/dsh-credentials-file.ts）。
 *
 * 只读。凭据值只在内存里出现，不写日志、不进快照。缺文件即 fail-closed。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { CORE_SCHEMA, load } from 'js-yaml';
import {
  agentHomeDir,
  parseModelDirectory,
  resolveAgentHome,
  type AgentHomeView,
  type ModelDirectorySnapshot,
} from '@walker/shared';
import type { ModelDirectoryPort } from '../ports/model-directory.port';
import { readAllCredentials } from '../runtime/dsh-credentials-file';
import { resolveModelHomeDir } from '../runtime/dsh-home-paths';

// 路径规则统一在 runtime/dsh-home-paths.ts（runtime 与 adapters 共用）；
// 此处重导出，保持既有 import 与测试不变。
export { resolveModelHomeDir } from '../runtime/dsh-home-paths';

function readYaml(file: string): unknown {
  if (!fs.existsSync(file)) return null;
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) return null;
    return load(text, { schema: CORE_SCHEMA });
  } catch {
    return null;
  }
}

@Injectable()
export class FsModelDirectory implements ModelDirectoryPort {
  private readonly home: string;

  constructor(homeDir: string = resolveModelHomeDir()) {
    this.home = homeDir;
  }

  homeDir(): string {
    return this.home;
  }

  private settingsDoc(): unknown {
    return readYaml(path.join(this.home, 'settings.yaml'));
  }

  /**
   * 凭据引用集合 —— 只取键名，绝不取值。
   * 真相源是 credentials.env（与运行时 providerCredential 读的是同一个文件）。
   */
  private credentialRefs(): string[] {
    return Array.from(readAllCredentials(this.home).keys());
  }

  snapshot(): ModelDirectorySnapshot {
    return parseModelDirectory({
      settings: this.settingsDoc(),
      credentialRefs: this.credentialRefs(),
      home: this.home,
    });
  }

  /**
   * 某个 Agent 的有效环境（R26）：共享层 + 该 Agent 目录下的覆盖层。
   * 布局：<home>/agents/<agentId>/{settings.yaml,credentials.env}
   * 凭据默认共用共享层；Agent 自带 credentials.env 时按引用名覆盖。
   * agentId 非法时 fail-closed 抛错（不允许穿越到共享层或其他 Agent）。
   */
  agentHome(agentId: string): AgentHomeView {
    const dir = agentHomeDir(this.home, agentId);
    return resolveAgentHome({
      rootHome: this.home,
      agentId,
      sharedSettings: this.settingsDoc(),
      agentSettings: readYaml(path.join(dir, 'settings.yaml')),
      sharedCredentialRefs: this.credentialRefs(),
      agentCredentialRefs: Array.from(readAllCredentials(dir).keys()),
    });
  }

  credentialValue(ref: string): string | null {
    const value = readAllCredentials(this.home).get(ref);
    return value && value.length > 0 ? value : null;
  }

  /** 检索环境变量兜底：本地联调可用 env 提供引用值（与 dsh 的环境层同义）。 */
  credentialValueFromEnv(ref: string, env: NodeJS.ProcessEnv = process.env): string | null {
    const value = env[ref]?.trim();
    return value ? value : null;
  }

  credentialRevision(ref: string): string | null {
    const value = this.credentialValue(ref);
    if (!value) return null;
    return createHash('sha256').update(`${ref}:\n${value}`).digest('hex').slice(0, 16);
  }
}
