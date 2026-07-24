/**
 * 今日（页）— 下一动作编排
 * 职责：池面快照 + pickNextActions；路径走 ADMIN_ROUTES。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Inbox,
  RefreshCw,
  Sprout,
} from 'lucide-react';
import {
  pickNextActions,
  type NextAction,
  type NextActionKind,
} from '@walker/shared';
import {
  adminApi,
  type Clue,
  type Execution,
  type Metrics,
  type Seed,
} from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';
import { ADMIN_ROUTES } from '../shared/routes';

const KIND_ICON = {
  'pool-clue': Inbox,
  'promote-seed': Sprout,
  'review-execution': CircleCheck,
  'deliver-execution': ClipboardList,
} as const;

const KIND_HREF: Record<NextActionKind, string> = {
  'pool-clue': ADMIN_ROUTES.clues,
  'promote-seed': ADMIN_ROUTES.seeds,
  'review-execution': ADMIN_ROUTES.executions,
  'deliver-execution': ADMIN_ROUTES.executions,
};

export function TodayPage() {
  const [clues, setClues] = useState<Clue[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [health, setHealth] = useState<{
    ok: boolean;
    db: boolean;
    aiEnabled: boolean;
  } | null>(null);
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      const results = await Promise.allSettled([
        adminApi.clues(),
        adminApi.seeds(),
        adminApi.executions(),
        adminApi.metrics(),
        adminApi.health(),
      ]);

      if (results[0].status === 'fulfilled') setClues(results[0].value);
      if (results[1].status === 'fulfilled') setSeeds(results[1].value);
      if (results[2].status === 'fulfilled') setExecutions(results[2].value);
      if (results[3].status === 'fulfilled') setMetrics(results[3].value);
      if (results[4].status === 'fulfilled') setHealth(results[4].value);

      const processReject = [results[0], results[1], results[2]].find(
        (r) => r.status === 'rejected',
      );
      if (processReject && processReject.status === 'rejected') {
        throw processReject.reason;
      }
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(
    () =>
      pickNextActions({
        clues: clues.map((c) => ({
          id: c.id,
          body: c.body,
          poolStatus: c.poolStatus,
        })),
        seeds: seeds.map((s) => ({
          id: s.id,
          title: s.title,
          primaryClueId: s.primaryClueId,
        })),
        executions: executions.map((ex) => ({
          id: ex.id,
          seedId: ex.seedId,
          status: ex.status,
          deliveryUrl: ex.deliveryUrl,
          outcome: ex.outcome,
        })),
      }),
    [clues, seeds, executions],
  );

  const counts = useMemo(
    () => ({
      candidate: clues.filter((c) => c.poolStatus === 'candidate').length,
      inPool: clues.filter((c) => c.poolStatus === 'in-pool').length,
      openSeed: seeds.filter((s) => !s.primaryClueId).length,
      openEx: executions.filter((ex) => ex.outcome == null).length,
    }),
    [clues, seeds, executions],
  );

  return (
    <div>
      <header className="page-head">
        <h1>今日</h1>
        <p className="page-lead">
          只读过程列表算下一动作，不写第二份业务事实。
        </p>
      </header>
      {err ? <p className="error">{err}</p> : null}

      <section className="panel">
        <h3>系统</h3>
        <div className="health-pills">
          <span
            className={`health-pill${health?.ok ? ' is-ok' : health ? ' is-bad' : ''}`}
          >
            API {health ? (health.ok ? '可用' : '异常') : '…'}
          </span>
          <span
            className={`health-pill${health?.db ? ' is-ok' : health ? ' is-bad' : ''}`}
          >
            库 {health ? (health.db ? '已连' : '未连') : '…'}
          </span>
          <span className="health-pill">
            AI {health ? (health.aiEnabled ? '开' : '关 · 规则 nextStep') : '…'}
          </span>
        </div>
        {metrics ? (
          <p className="muted">
            闭环 {metrics.countableLoops} · 有用 {metrics.yesCount} · 线索{' '}
            {metrics.clues} · 题苗 {metrics.seeds} · 执行 {metrics.executions}
          </p>
        ) : null}
        <button type="button" className="secondary" onClick={() => void load()}>
          <RefreshCw size={14} aria-hidden />
          刷新
        </button>
      </section>

      <section className="panel">
        <h3>池面快照</h3>
        <div className="stat-row">
          <div className="stat-chip">
            <span className="stat-chip-label">候选</span>
            <span className="stat-chip-value">{counts.candidate}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">已入池</span>
            <span className="stat-chip-value">{counts.inPool}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">待主选</span>
            <span className="stat-chip-value">{counts.openSeed}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">未结执行</span>
            <span className="stat-chip-value">{counts.openEx}</span>
          </div>
        </div>
        <div className="quick-links">
          <Link className="secondary" to={ADMIN_ROUTES.clues}>
            线索
          </Link>
          <Link className="secondary" to={ADMIN_ROUTES.seeds}>
            题苗
          </Link>
          <Link className="secondary" to={ADMIN_ROUTES.executions}>
            执行
          </Link>
          <Link className="secondary" to={ADMIN_ROUTES.metrics}>
            数
          </Link>
        </div>
      </section>

      <section className="panel">
        <h3>下一动作</h3>
        {actions.length === 0 ? (
          <p className="empty-state">
            当前无待办。可手动入库线索或等待访客卡口。
          </p>
        ) : (
          <ul className="action-list">
            {actions.map((a) => (
              <NextActionRow key={`${a.kind}-${a.id}`} action={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NextActionRow({ action }: { action: NextAction }) {
  const Icon = KIND_ICON[action.kind];
  const href = KIND_HREF[action.kind];
  return (
    <li className="action-item">
      <Icon size={18} className="action-item-icon" aria-hidden />
      <div className="action-item-body">
        <div className="action-item-title">{action.label}</div>
        <div className="action-item-summary">{action.summary}</div>
      </div>
      <Link to={href} className="action-item-go">
        去处理
        <ArrowRight size={14} aria-hidden />
      </Link>
    </li>
  );
}
