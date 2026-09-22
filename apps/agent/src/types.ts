/** 判断代理共享类型与服务名 */

export interface KnowledgeEntry {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  domain?: string;
  form?: string;
  intent?: string;
  body: string;
  /** aiUsePolicy 快照：readable=可读给调用方，citable=可进检索/推荐 */
  readable: boolean;
  citable: boolean;
}

export interface SearchHit {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  why: string;
}

export interface MethodologyGroup {
  domain: string;
  count: number;
  intents: string[];
  titles: string[];
}

export type TelemetryTool =
  | 'search_judgment'
  | 'read_article'
  | 'list_methodology'
  | 'list_citable'
  | 'neighbors'
  // 代码结构（PRD-CODE-GRAPH）：方向语义严格区分 —— dependencies = 它依赖谁，
  // dependents = 谁依赖它，二者是不同的问题
  | 'dependencies'
  | 'dependents'
  | 'impact'
  | 'architecture_health';

export interface TelemetryEvent {
  tool: TelemetryTool;
  ok: boolean;
  detail?: string;
}
