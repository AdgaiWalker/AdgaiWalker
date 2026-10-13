/**
 * AdgaiWalker 的模型凭据文件读写（`<DSH_HOME>/credentials.env`）。
 *
 * 为什么不用 dsh 的 `.credentials.yaml`：实测 0.1.5-rc.3 的 sdk profile
 * **只要 home 里存在该文件就启动失败**，所以凭据值必须另存。
 * 这里走 dsh 凭据缝支持的另一条通道——环境变量 provider：
 * settings.yaml 持「引用名」，本文件持值，运行时读出来注入子进程环境变量。
 *
 * 为什么独立成模块：**运行时启动**（harness-launch）与**后台配置界面**
 * （adapters/fs-model-credential）都要读写它。各写一份解析迟早不一致。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 引用名必须是可作环境变量名的形态。 */
export const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function credentialsFilePath(root: string): string {
  return path.join(root, 'credentials.env');
}

/** 解析 `KEY=value` 行；注释、空行与坏行跳过（不猜测）。值两端引号会去掉。 */
export function parseCredentialEnv(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (CREDENTIAL_REF_PATTERN.test(key)) map.set(key, value);
  }
  return map;
}

export function readAllCredentials(root: string): Map<string, string> {
  const file = credentialsFilePath(root);
  if (!fs.existsSync(file)) return new Map();
  try {
    return parseCredentialEnv(fs.readFileSync(file, 'utf8'));
  } catch {
    return new Map();
  }
}

/** 读单个引用；没有或为空返回 null。 */
export function readCredential(root: string, ref: string): string | null {
  const value = readAllCredentials(root).get(ref);
  return value && value.length > 0 ? value : null;
}

/** 原子写（临时文件 + rename），0600；目录不存在则创建。 */
function persist(root: string, values: Map<string, string>): void {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const lines = [
    '# AdgaiWalker 模型凭据（明文，仅存服务器 data 目录；.gitignore 已忽略）',
    '# 格式：引用名=值。settings.yaml 用同名引用（apiKeyEnv）指到这里。',
    ...Array.from(values.entries()).map(([key, value]) => `${key}=${value}`),
    '',
  ];
  const file = credentialsFilePath(root);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** 写入或更新；返回是否变化。非法引用名/空值 fail-closed。 */
export function writeCredential(root: string, ref: string, value: string): boolean {
  if (!CREDENTIAL_REF_PATTERN.test(ref)) throw new Error(`credential-ref-invalid: ${ref}`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error('credential-value-empty');
  const current = readAllCredentials(root);
  if (current.get(ref) === trimmed) return false;
  current.set(ref, trimmed);
  persist(root, current);
  return true;
}

/** 删除；返回是否删掉了。 */
export function removeCredential(root: string, ref: string): boolean {
  const current = readAllCredentials(root);
  if (!current.has(ref)) return false;
  current.delete(ref);
  persist(root, current);
  return true;
}
