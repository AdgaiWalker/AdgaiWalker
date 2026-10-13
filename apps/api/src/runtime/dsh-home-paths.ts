/**
 * AdgaiWalker 的 Harness home 路径规则（R26）。
 *
 * 为什么单独成一个模块：这组路径既要给配置读取（adapters/fs-model-directory）用，
 * 也要给运行时启动（runtime/harness-launch）用。放在任一侧都会造成层间反向依赖，
 * 所以提取成中立的纯路径工具。
 *
 * 硬规则（2026-09-23 站主决定）：**不读、不回落站主个人环境**（~/.dsh / DSH_HOME）。
 * 产品配置一旦绑到站主个人环境，就会出现"改了站主设置，产品行为跟着变"的事故（实测发生过）。
 */
import path from 'node:path';

/**
 * Harness 环境根目录（= AdgaiWalker 自己的 DSH_HOME）。
 *
 * 优先级：`WALKER_MODEL_HOME`（部署时可指向独立目录）> 仓库内 `apps/api/data/dsh-home`。
 * **刻意不回落到 `~/.dsh` 或 `DSH_HOME`**。
 */
export function resolveModelHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.WALKER_MODEL_HOME?.trim();
  if (explicit) return path.resolve(explicit);
  return path.resolve(__dirname, '../../data/dsh-home');
}

/**
 * 某个 Agent 的 home 目录：`<root>/agents/<agentId>`。
 *
 * agentId 的合法性由 shared 的 `agentHomeDir` 校验（fail-closed，禁止路径穿越）；
 * 这里只负责拼根目录，不重复实现安全规则。
 */
export function agentHomeUnderRoot(root: string, agentId: string): string {
  return path.join(root, 'agents', agentId);
}

/** 该 Agent 的 Cordis profile 目录（dsh 的 profile 名固定 sdk）。 */
export function agentProfileUnderRoot(root: string, agentId: string): string {
  return path.join(agentHomeUnderRoot(root, agentId), 'profiles', 'sdk');
}
