/**
 * 知识图谱数据源端口。
 *
 * 边界说明（重要）：图谱是**导航结构**，不是 AI 引用面——因此它不受
 * `aiUsePolicy.readable/citable` 过滤（那一道边界由 SiteContentIndexPort 收紧），
 * 但只包含公开可达内容。机器消费（MCP）在出口处再按 citable 二次收紧，见 PRD §5.3。
 *
 * 权威：docs/PRD-KNOWLEDGE-GRAPH.md
 */
import type { KnowledgeGraph } from '@walker/shared';

export interface KnowledgeGraphPort {
  /** 返回由当前公开内容构建的图谱；内容不可用时应抛错而不是返回空图 */
  load(): Promise<KnowledgeGraph>;
}

export const KNOWLEDGE_GRAPH = Symbol('KNOWLEDGE_GRAPH');
