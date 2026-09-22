import { useList, useOne } from "@refinedev/core";
import { useQuery } from "@tanstack/react-query";
import type {
  AgentRevisionDetail,
  ContentLedgerEntry,
  ExecutionEventView,
  ExecutionRunListItem,
  ExecutionRunView,
  OpsAgent,
  OpsContentDetail,
} from "@walker/shared";
import { requestJson } from "./http";

export const useContent = () =>
  useList<ContentLedgerEntry & { id: string }>({
    resource: "content",
    pagination: { mode: "off" },
  }).query;
export const useAgents = () =>
  useList<OpsAgent>({ resource: "agents", pagination: { mode: "off" } }).query;
export function useExecutionRuns(agentId = "", cursor = "", limit = 20) {
  return useQuery({
    queryKey: ["execution-runs", agentId, cursor, limit],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (agentId) params.set("agentId", agentId);
      if (cursor) params.set("cursor", cursor);
      return requestJson<{ items: ExecutionRunListItem[]; next: string | null; total: number }>(
        "/ops/execution-runs?" + params.toString(),
        { signal },
      );
    },
  });
}
export const useContentDetail = (slug: string) =>
  useOne<OpsContentDetail & { id: string }>({ resource: "content", id: slug }).query;
export function useExecutionRun(id: string) {
  return useQuery({
    queryKey: ["execution-run", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<ExecutionRunView>("/ops/execution-runs/" + encodeURIComponent(id), { signal }),
  });
}
export function useExecutionEvents(id: string) {
  return useQuery({
    queryKey: ["execution-events", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => requestJson<{ items: ExecutionEventView[] }>("/ops/execution-runs/" + encodeURIComponent(id) + "/events", { signal }),
  });
}
export const useAgentDetail = (id: string) => useOne<AgentRevisionDetail>({ resource: "agents", id }).query;
