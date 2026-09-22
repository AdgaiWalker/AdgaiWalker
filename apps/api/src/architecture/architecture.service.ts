/**
 * 代码结构体检（站主面）。
 *
 * 「图给人看形状，清单给人动手」—— 与 GraphService 同一分工：这里只产出清单与计数，
 * 不做第二张图。对账（哪些是已知债务、哪些是这次新增）复用 shared 的 `diffCodeDebt`，
 * 与构建期门禁 `verify:architecture` **同一口径**：两边不可能说出不同的结论。
 */
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CODE_DEBT_CATEGORIES,
  acceptedDebtFromHealth,
  diffCodeDebt,
  type CodeDebtCategory,
  type CodeDebtItem,
  type CodeGraphHealthArtifact,
} from '@walker/shared';
import {
  CODE_HEALTH,
  CodeHealthError,
  type CodeHealthBundle,
  type CodeHealthPort,
} from '../ports/code-health.port';

export type CodeDebtCategoryCount = {
  category: CodeDebtCategory;
  accepted: number;
  current: number;
  added: number;
  resolved: number;
};

export type ArchitectureHealthView = {
  health: CodeGraphHealthArtifact;
  /** 基线状态：缺席（还没跑过 --update-baseline）时为 null */
  baseline: {
    generatedAt: string;
    sourceCommit: string;
    total: number;
    /** 新增即说明门禁会失败；resolved 说明可以收敛基线 */
    added: CodeDebtItem[];
    resolved: CodeDebtItem[];
    categories: CodeDebtCategoryCount[];
  } | null;
  /** 公开图的基本规模，供 admin 卡片显示「这张图有多大」 */
  graphTotals: { nodes: number; edges: number };
};

function countAccepted(health: CodeGraphHealthArtifact): number {
  return (
    health.cycles.length +
    health.unresolved.length +
    health.unreachable.length +
    health.reverseDependencies.length
  );
}

@Injectable()
export class ArchitectureService {
  constructor(@Inject(CODE_HEALTH) private readonly source: CodeHealthPort) {}

  async health(): Promise<ArchitectureHealthView> {
    // 读端失败按「谁的错」映射成 HTTP：没生成/配错 → 503（可操作：跑 code:gen 或改配置），
    // 产物坏 → 500（数据问题）。裸 TypeError 一律不外泄。
    let bundle: CodeHealthBundle;
    try {
      bundle = await this.source.load();
    } catch (error) {
      if (error instanceof CodeHealthError) {
        throw new HttpException(
          { code: error.code, message: error.message },
          error.code === 'code-health-malformed'
            ? HttpStatus.INTERNAL_SERVER_ERROR
            : HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
    const { graph, health, baseline } = bundle;
    const current = acceptedDebtFromHealth(health);

    return {
      health,
      baseline: baseline
        ? {
            generatedAt: baseline.generatedAt,
            sourceCommit: baseline.sourceCommit,
            total: CODE_DEBT_CATEGORIES.reduce(
              (total, category) => total + baseline.accepted[category].length,
              0,
            ),
            ...diffCodeDebt(current, baseline.accepted),
          }
        : null,
      graphTotals: { nodes: graph.nodes.length, edges: graph.edges.length },
    };
  }

  /** 供单元测试断言「基线缺席时也不冒充对账过」 */
  static countAccepted = countAccepted;
}
