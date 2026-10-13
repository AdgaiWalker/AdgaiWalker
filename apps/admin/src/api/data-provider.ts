import type {
  BaseRecord,
  DataProvider,
  GetListParams,
  GetOneParams,
} from "@refinedev/core";
import type {
  AgentRevisionDetail,
  ContentLedger,
  OpsAgent,
  OpsContentDetail,
  OpsList,
  ExecutionRunListItem,
  ExecutionRunView,
} from "@walker/shared";
import { ApiError, requestJson } from "./http";
const unavailable = async (): Promise<never> => {
  throw new ApiError("not-connected", "这项操作尚未接通", 405);
};
export const dataProvider: DataProvider = {
  getApiUrl: () => "/api",
  async getList<T extends BaseRecord>({
    resource,
    pagination,
    filters,
  }: GetListParams) {
    if (resource === "content") {
      const response = await requestJson<ContentLedger>("/admin/content/ledger");
      if (!Array.isArray(response.items))
        throw new ApiError("invalid-response", "内容数据格式不正确");
      return {
        data: response.items.map((item) => ({
          ...item,
          id: item.slug,
        })) as unknown as T[],
        total: response.items.length,
        generatedAt: response.generatedAt,
        gitAvailable: response.gitAvailable,
        publicationAvailable: response.publicationAvailable,
      };
    }
    if (resource === "agents") {
      const response = await requestJson<{ items: OpsAgent[]; total: number }>(
        "/ops/agents",
      );
      if (!Array.isArray(response.items))
        throw new ApiError("invalid-response", "Agent 数据格式不正确");
      return { data: response.items as unknown as T[], total: response.total };
    }
    if (resource === "runs") {
      const valueOf = (field: string) => {
        const found = filters?.find((item) => "field" in item && item.field === field);
        return found && "value" in found && found.value ? String(found.value) : "";
      };
      const params = new URLSearchParams({ limit: String(pagination?.pageSize ?? 20) });
      if (valueOf("agentId")) params.set("agentId", valueOf("agentId"));
      if (valueOf("cursor")) params.set("cursor", valueOf("cursor"));
      const response = await requestJson<{ items: ExecutionRunListItem[]; total: number }>(`/ops/execution-runs?${params}`);
      if (!Array.isArray(response.items) || typeof response.total !== "number")
        throw new ApiError("invalid-response", "运行数据格式不正确");
      return { data: response.items as unknown as T[], total: response.total };
    }
    throw new ApiError("unknown-resource", "尚未接入这类数据", 404);
  },
  async getOne<T extends BaseRecord>({ resource, id }: GetOneParams) {
    if (resource === "content") {
      const data = await requestJson<OpsContentDetail>(
        `/admin/content/${encodeURIComponent(String(id))}`,
      );
      return { data: { ...data, id: data.slug } as unknown as T };
    }
    if (resource === "agents") return { data: await requestJson<AgentRevisionDetail>(`/ops/agents/${encodeURIComponent(String(id))}`) as unknown as T };
    if (resource === "runs")
      return {
        data: (await requestJson<ExecutionRunView>(
          `/ops/execution-runs/${encodeURIComponent(String(id))}`,
        )) as unknown as T,
      };
    throw new ApiError("unknown-resource", "找不到这项数据", 404);
  },
  create: unavailable,
  update: unavailable,
  deleteOne: unavailable,
};
