import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentUnitService } from './agent-unit.service';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { AgentExecutionService, type ExecutionRunOutcome } from '../execution/agent-execution.service';
import { AuthorizationService } from '../authorization/authorization.service';

export type AgentChatResult = {
  agentId: string;
  output: string;
  /** 引擎归因：本次解析到的供应商（null = 该修订没绑定提供方，由系统默认决定） */
  providerId: string | null;
  model: string;
  /** 直调不设采样温度（用模型默认值），所以是 null —— 不假装成 0。 */
  temperature: number | null;
  /** 行为归因：当次系统提示词全文 */
  promptSnapshot: string;
  elapsedMs: number;
  usage: { promptTokens: number; completionTokens: number; cacheHitTokens: number };
};

/**
 * 管理侧直调（试一句话）。
 *
 * 这**不是**第二套执行器：它只是统一执行栈的一个薄入口——选授权、入队、等终态、
 * 读结果，四步全部复用与 admin 试跑相同的实现。历史版本自己挑授权（不看剩余额度）、
 * 自己拍 2 秒等待窗口、把空事件当成功返回，是本轮修掉的根因。
 *
 * 语义约定：
 * - 没有可用授权 → 409 `grant-required`（本方法**不隐式签发**，签发是显式审计动作）
 * - 运行没成功 → 5xx + `state`/`stopReason`，绝不返回空串当成功
 * - 成功但没有文本 → 502 `agent-run-empty`（同样是失败，如实报错）
 */
@Injectable()
export class AgentRunnerService {
  constructor(
    // 显式 token：本仓的 vitest 走 esbuild，**不发 design:paramtypes 元数据**，
    // 「按类型注入」在测试环境里解析不到（会得到一个 undefined 的依赖）。
    // 一律用 @Inject，生产与测试同语义。
    @Inject(AgentUnitService) private readonly agentService: AgentUnitService,
    @Inject(AGENT_REVISION_REPOSITORY) private readonly revisions: AgentRevisionRepositoryPort,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AgentExecutionService) private readonly execution: AgentExecutionService,
  ) {}

  async runChat(
    agentId: string,
    input: {
      input: string;
      providerId?: string | null;
      modelId?: string;
      temperature?: number;
    },
  ): Promise<AgentChatResult> {
    const agent = await this.agentService.findById(agentId);
    if (!agent) {
      throw new HttpException({ code: 'agent-not-found', message: '智能体不存在' }, HttpStatus.NOT_FOUND);
    }
    const text = input.input?.trim() ?? '';
    if (text.length < 2) {
      throw new HttpException(
        { code: 'invalid-input', message: 'input 至少 2 个字符' },
        HttpStatus.BAD_REQUEST,
      );
    }
    // 引擎解析顺序：角色绑定 → 系统默认。直调不提供覆盖，归因才可信。
    if (input.providerId || input.modelId || input.temperature !== undefined) {
      throw new HttpException({ code: 'execution-denied', message: '不能通过直调更换模型或温度' }, HttpStatus.FORBIDDEN);
    }
    const detail = await this.revisions.detail(agentId);
    const revision = detail?.revisions[0];
    if (!detail || detail.archivedAt || !revision) {
      throw new HttpException({ code: 'execution-denied', message: '当前请求不允许执行' }, HttpStatus.FORBIDDEN);
    }

    const grant = await this.requireUsableGrant(agentId);
    const accepted = await this.execution.accept({
      idempotencyKey: 'legacy' + randomUUID().replace(/-/g, '').slice(0, 16),
      kind: 'chat', agentRevisionId: revision.id, input: text, grantId: grant.id,
    });
    const outcome = await this.execution.awaitTerminal(accepted.id);
    if (!outcome) {
      throw new HttpException({ code: 'agent-run-missing', message: '这次运行已经不在库里，无法确认结果' }, HttpStatus.NOT_FOUND);
    }
    if (!outcome.success) throw runFailure(outcome);
    const output = await this.execution.savedText(accepted.id);
    if (!output.trim()) {
      throw new HttpException(
        { code: 'agent-run-empty', message: '运行报告成功但没有产出任何文本', runId: outcome.runId },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return {
      agentId,
      output,
      providerId: revision.providerId,
      model: revision.modelId,
      temperature: null,
      promptSnapshot: revision.prompt,
      elapsedMs: outcome.elapsedMs ?? 0,
      usage: {
        promptTokens: outcome.tokensIn ?? 0,
        completionTokens: outcome.tokensOut ?? 0,
        cacheHitTokens: 0,
      },
    };
  }

  /**
   * 取一条现在就能跑的授权。判据与挑选顺序都在 shared（`grantUsable` + `pickUsableGrant`），
   * 与调度侧的原子预留同源；挑不到就如实拒绝，而不是拿一条用满的授权去空跑。
   */
  private async requireUsableGrant(agentId: string) {
    const grant = await this.authorization.selectUsable({
      origin: 'admin', principalType: 'owner', principalId: 'owner',
      agentId, action: 'agent:run', resourceKind: 'agent', resourceId: agentId,
    });
    if (!grant) {
      throw new HttpException(
        { code: 'grant-required', message: '这个 Agent 名下没有还有额度的授权；先签发一条（额度用完的授权不会自动续）' },
        HttpStatus.CONFLICT,
      );
    }
    return grant;
  }
}

/**
 * 终态 → **结构化**错误：调用方一眼看出是没额度、超时还是运行崩了。
 *
 * 状态码按"调用方能做什么"分：没额度是**可修的冲突**（去签一条授权），超时是网关超时，
 * 其余归上游失败。用一张表而不是嵌套三元，加一类 stopReason 只改一行。
 */
const RUN_FAILURE_RESPONSE: Record<string, { status: HttpStatus; code: string }> = {
  quota: { status: HttpStatus.CONFLICT, code: 'agent-run-quota' },
  deadline: { status: HttpStatus.GATEWAY_TIMEOUT, code: 'agent-run-timeout' },
  'runtime-error': { status: HttpStatus.BAD_GATEWAY, code: 'agent-run-failed' },
};
const DEFAULT_RUN_FAILURE = { status: HttpStatus.BAD_GATEWAY, code: 'agent-run-failed' };

function runFailure(outcome: ExecutionRunOutcome): HttpException {
  const mapped = (outcome.stopReason && RUN_FAILURE_RESPONSE[outcome.stopReason]) || DEFAULT_RUN_FAILURE;
  return new HttpException(
    {
      code: mapped.code,
      message: `运行未成功：state=${outcome.state}${outcome.stopReason ? ` stopReason=${outcome.stopReason}` : ''}`,
      runId: outcome.runId,
      state: outcome.state,
      stopReason: outcome.stopReason,
    },
    mapped.status,
  );
}
