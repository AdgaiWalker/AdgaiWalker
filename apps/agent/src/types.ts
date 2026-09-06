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

export type TelemetryTool = 'search_judgment' | 'read_article' | 'list_methodology' | 'list_citable';

export interface TelemetryEvent {
  tool: TelemetryTool;
  ok: boolean;
  detail?: string;
}
