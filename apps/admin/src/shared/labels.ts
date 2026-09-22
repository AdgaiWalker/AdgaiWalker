import type { OpsCapabilityKey } from "@walker/shared";
export const capabilityLabels: Record<OpsCapabilityKey, string> = {
  contentRead: "浏览内容",
  agentsRead: "查看 Agent",
  runsRead: "回看运行",
  agentExecute: "调用 Agent",
  agentDeploy: "部署到前台",
  contentWrite: "修改内容",
  contentPublish: "发布内容",
  conversations: "访客对话",
  reminders: "更新提醒",
};
export const typeLabel = (value: string) =>
  ({
    knowledge: "文章",
    learn: "学习笔记",
    project: "项目",
    tool: "工具",
    idea: "想法",
  })[value] ?? value;
export const visibilityLabel = (value: string) =>
  ({ public: "公开", draft: "草稿", private: "私密" })[value] ?? "未知";
export const statusLabel = (value: string) =>
  ({
    SUCCESS: "执行成功", FAILED: "执行失败", CANCELLED: "已取消",
    QUEUED: "排队中", CLAIMED: "已领取", RUNNING: "运行中", STOPPING: "停止中",
    UNKNOWN: "无法确认", SUCCEEDED: "已完成",
  })[value] ?? "状态未知";
export function timeLabel(value?: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "未知";
}
