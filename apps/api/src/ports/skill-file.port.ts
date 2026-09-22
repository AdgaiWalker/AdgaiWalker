/**
 * 技能文件存储端口 —— 「角色（DB）→ 技能包（文件）」的**写侧收敛**。
 *
 * 不变量③：agent 的定义只有一个规范形态（skills/<id>/ 文件）。
 * 后台保存角色时同步落文件，让每个角色天生就是可迁移、可导出的技能包。
 *
 * 冲突策略（防数据丢失，刻意保守）：
 * - `SKILL.md`：**仅当缺失时脚手架** —— 已有文件可能被手工打磨过，DB 提示词
 *   不覆盖它（文件是提示词的真身；后台改提示词前应先确认两边一致）。
 * - `skill.json`：**始终同步绑定字段**（id/name/bindingExample）—— 绑定是
 *   DB 的权威数据；requirement/params 等保留文件现值。
 * - `cases.json`：永不触碰 —— 考题是手工资产。
 */
import type { AgentUnitRow } from './agent-unit.repository';

export interface SkillFileStorePort {
  /** 把角色同步成技能包文件；写失败抛错由调用方决定形态 */
  syncFromUnit(unit: AgentUnitRow): Promise<void>;
}

export const SKILL_FILE_STORE = Symbol('SKILL_FILE_STORE');
