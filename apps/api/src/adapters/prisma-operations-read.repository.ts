import { Inject, Injectable } from "@nestjs/common";
import type { AgentRun } from "@prisma/client";
import type { OpsRun } from "@walker/shared";
import { PRISMA, type PrismaPort } from "../ports/prisma.port";
import type { OperationsReadPort } from "../ports/operations-read.repository";
import { storageUnavailable } from "../common/http-error";

function summary(row: AgentRun & { agent: { name: string } }): OpsRun {
  const total = row.tokensPrompt + row.tokensCompletion;
  return {
    id: row.id,
    agentId: row.agentId,
    agentName: row.agent.name,
    model: row.model,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    elapsedMs: row.elapsedMs > 0 ? row.elapsedMs : null,
    tokens: total > 0 ? total : null,
    revision: null,
    delivery: null,
  };
}
@Injectable()
export class PrismaOperationsReadRepository implements OperationsReadPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}
  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }
  async runs(input: { page: number; pageSize: number; agentId?: string }) {
    const where = input.agentId ? { agentId: input.agentId } : {};
    const [rows, total] = await this.db().$transaction([
      this.db().agentRun.findMany({
        where,
        include: { agent: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db().agentRun.count({ where }),
    ]);
    return {
      items: rows.map(summary),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async run(id: string) {
    const row = await this.db().agentRun.findUnique({
      where: { id },
      include: { agent: { select: { name: true } } },
    });
    return row
      ? { ...summary(row), instruction: row.instruction, output: row.output }
      : null;
  }
}
