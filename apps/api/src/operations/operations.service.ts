import { Inject, Injectable } from "@nestjs/common";
import type { OpsAgent, OpsCapabilities } from "@walker/shared";
import {
  AGENT_REVISION_REPOSITORY,
  type AgentRevisionRepositoryPort,
} from "../ports/agent-revision.repository";
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from "../ports/content-file.repository";
import {
  AGENT_EXECUTION_REPOSITORY,
  type AgentExecutionRepositoryPort,
} from "../ports/agent-execution.repository";
import {
  OPERATIONS_READ,
  type OperationsReadPort,
} from "../ports/operations-read.repository";
import { ApiError } from "../common/http-error";

@Injectable()
export class OperationsService {
  constructor(
    @Inject(AGENT_REVISION_REPOSITORY)
    private readonly agentsRepository: AgentRevisionRepositoryPort,
    @Inject(CONTENT_FILE_REPOSITORY)
    private readonly content: ContentFileRepositoryPort,
    @Inject(OPERATIONS_READ) private readonly records: OperationsReadPort,
    @Inject(AGENT_EXECUTION_REPOSITORY) private readonly executions: AgentExecutionRepositoryPort,
  ) {}
  async capabilities(): Promise<OpsCapabilities> {
    // 真正检查读用例：SELECT 1 成功不代表所需数据表存在。
    const [agents, runs, content, execution] = await Promise.allSettled([
      Promise.resolve().then(() => this.agentsRepository.list()),
      Promise.resolve().then(() => this.records.runs({ page: 1, pageSize: 1 })),
      this.content.list(),
      Promise.resolve().then(() => this.executions.countOccupying()),
    ]);
    const agentsReady = agents.status === "fulfilled";
    const runsReady = runs.status === "fulfilled";
    const contentReady = content.status === "fulfilled";
    const executionReady = execution.status === "fulfilled";
    return {
      checkedAt: new Date().toISOString(),
      database: "sqlite",
      items: [
        {
          key: "contentRead",
          state: contentReady ? "available" : "unavailable",
          reason: contentReady ? "可以浏览内容正本" : "暂时无法读取内容目录",
        },
        {
          key: "agentsRead",
          state: agentsReady ? "available" : "unavailable",
          reason: agentsReady ? "可以查看已有角色" : "角色数据暂不可用",
        },
        {
          key: "runsRead",
          state: runsReady ? "available" : "unavailable",
          reason: runsReady ? "可以回看历史执行记录" : "运行数据暂不可用",
        },
        {
          key: "agentExecute",
          state: executionReady ? "available" : "unavailable",
          reason: executionReady ? "可以提交后台试跑，结果只来自实际运行记录" : "运行记录暂不可用",
        },
        ...(
          [
            "agentDeploy",
            "contentWrite",
            "contentPublish",
            "conversations",
            "reminders",
          ] as const
        ).map((key) => ({
          key,
          state: "not-connected" as const,
          reason: "将在后续批次接通",
        })),
      ],
    };
  }
  async agents(): Promise<{ items: OpsAgent[]; total: number }> {
    // 直接读取仓储；不调用会自动创建默认角色的旧 list 用例。
    const items = await this.agentsRepository.list();
    return { items, total: items.length };
  }
  runs(input: { page: number; pageSize: number; agentId?: string }) {
    return this.records.runs(input);
  }
  async run(id: string) {
    const row = await this.records.run(id);
    if (!row) throw new ApiError("run-not-found", 404, "找不到这条运行记录");
    return row;
  }
}
