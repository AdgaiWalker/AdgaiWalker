/**
 * 今日（页）
 * 职责：下一动作编排；规则在 pickNextActions，路径在 ADMIN_ROUTES。
 *
 * 依赖：admin-api 门面、@walker/shared 规则、ADMIN_ROUTES 配置
 * 调用：分路加载过程列表（互不拖死）
 * 触发：路由 /
 * 实现：快照 + 动作列表
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Inbox,
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

/** 规则 kind → 管理路径（展示层映射，不进 shared） */
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

      // 过程列表失败才抛；metrics/health 软失败不挡今日动作
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
      <h1>今日</h1>
      <p className="muted">
        只读过程列表算下一动作，不写第二份业务事实。
      </p>
      {err ? <p className="error">{err}</p> : null}

      <div className="panel">
        <h3>系统</h3>
        {health ? (
          <p className="muted">
            API {health.ok ? '可用' : '异常'} · 库{' '}
            {health.db ? '已连' : '未连'} · AI{' '}
            {health.aiEnabled ? '开' : '关（规则 nextStep）'}
          </p>
        ) : (
          <p className="muted">加载健康态…</p>
        )}
        {metrics ? (
          <p className="muted">
            可计数闭环 {metrics.countableLoops} · 有用 {metrics.yesCount} · 线索{' '}
            {metrics.clues} · 题苗 {metrics.seeds} · 执行 {metrics.executions}
          </p>
        ) : null}
        <button type="button" className="secondary" onClick={() => void load()}>
          刷新
        </button>
      </div>

      <div className="panel">
        <h3>池面快照</h3>
        <p className="muted">
          候选 {counts.candidate} · 已入池 {counts.inPool} · 待主选苗{' '}
          {counts.openSeed} · 未结执行 {counts.openEx}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
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
            指标
          </Link>
        </div>
      </div>

      <div className="panel">
        <h3>下一动作</h3>
        {actions.length === 0 ? (
          <p className="muted">当前无待办。可手动入库线索或等待访客卡口。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {actions.map((a) => (
              <NextActionRow key={`${a.kind}-${a.id}`} action={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NextActionRow({ action }: { action: NextAction }) {
  const Icon = KIND_ICON[action.kind];
  const href = KIND_HREF[action.kind];
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Icon size={18} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{action.label}</div>
        <div className="muted" style={{ marginTop: 4 }}>
          {action.summary}
        </div>
      </div>
      <Link
        to={href}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        去处理
        <ArrowRight size={14} />
      </Link>
    </li>
  );
}
