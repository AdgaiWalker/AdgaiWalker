/** 新后台只读合同。运行控制与内容发布尚未接通，不从旧记录推断新能力。 */
export type OpsCapabilityState = "available" | "unavailable" | "not-connected";
export type OpsCapabilityKey =
  | "contentRead"
  | "agentsRead"
  | "runsRead"
  | "agentExecute"
  | "agentDeploy"
  | "contentWrite"
  | "contentPublish"
  | "conversations"
  | "reminders";
export interface OpsCapability {
  key: OpsCapabilityKey;
  state: OpsCapabilityState;
  reason: string;
}
export interface OpsCapabilities {
  checkedAt: string;
  database: "sqlite";
  items: OpsCapability[];
}
export interface OpsList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface OpsAgent {
  id: string;
  name: string;
  modelId: string;
  isSystem: boolean;
  updatedAt: string;
  revision: number | null;
}
export interface OpsRun {
  id: string;
  agentId: string;
  agentName: string;
  model: string;
  status: string;
  elapsedMs: number | null;
  tokens: number | null;
  createdAt: string;
  revision: null;
  delivery: null;
}
export interface OpsRunDetail extends OpsRun {
  instruction: string;
  output: string;
}
export interface OpsContentDetail {
  slug: string;
  title: string;
  type: string;
  updatedAt: string;
  raw: string;
  ext: ".md" | ".mdx";
}

/** 不接受负数、小数、指数或超限分页。 */
export function parseOpsPagination(
  page = "1",
  pageSize = "20",
): { page: number; pageSize: number } | null {
  if (!/^\d+$/.test(page) || !/^\d+$/.test(pageSize)) return null;
  const p = Number(page),
    size = Number(pageSize);
  if (
    !Number.isSafeInteger(p) ||
    p < 1 ||
    p > 100_000 ||
    size < 1 ||
    size > 100
  )
    return null;
  return { page: p, pageSize: size };
}
