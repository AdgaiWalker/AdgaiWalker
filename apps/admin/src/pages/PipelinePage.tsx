/**
 * 流水线页 — 站主默认首页（M5）：池 → 苗 → 作 → 品 单页追踪全链。
 * 纯前端聚合现有 API（不加后端端点）；每段行内操作复用既有 adminApi；
 * 主选走 PromoteDialog（五问必填），审批绑定服务端审阅包候选 hash。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  adminApi,
  type AssistantQuestion,
  type Clue,
  type Execution,
  type Seed,
  type Work,
} from '../api/admin-api';
import { PromoteDialog } from '../components/PromoteDialog';
import { useAdminAction } from '../hooks/useAdminAction';

export const PIPELINE_STAGES = ['池', '苗', '作', '品'] as const;

type PublicationView = { channel: string; status: string; url: string | null; lastError: string | null };

export function PipelinePage() {
  const [clues, setClues] = useState<Clue[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [questions, setQuestions] = useState<AssistantQuestion[]>([]);
  const [publications, setPublications] = useState<Record<string, PublicationView[]>>({});
  const [converted, setConverted] = useState<Record<string, boolean>>({});
  const [promoteTarget, setPromoteTarget] = useState<Seed | null>(null);
  const [reviews, setReviews] = useState<Record<string, { hash: string; title: string }>>({});
  const [hints, setHints] = useState<Record<string, string>>({});
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      const [c, s, e, w, qs] = await Promise.all([
        adminApi.clues(),
        adminApi.seeds(),
        adminApi.executions(),
        adminApi.works(),
        adminApi.assistantQuestions(),
      ]);
      setClues(c);
      setSeeds(s);
      setExecutions(e);
      setWorks(w);
      setQuestions(qs);
      const finished = w.filter((x) =>
        ['REVIEW_READY', 'APPROVED', 'PARTIALLY_PUBLISHED'].includes(x.status),
      );
      const entries = await Promise.all(
        finished.map(async (x) => [x.id, await adminApi.workPublications(x.id)] as const),
      );
      setPublications(Object.fromEntries(entries));
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidate = clues.filter((c) => c.poolStatus === 'candidate');
  const inPool = clues.filter((c) => c.poolStatus === 'in-pool');
  const inboxSeeds = seeds.filter((s) => !s.workflowStatus || s.workflowStatus === 'INBOX' || s.workflowStatus === 'CANDIDATE');
  const doingExecs = executions.filter((e) => e.status === 'doing' && !e.deliveryUrl);
  const activeWorks = works.filter((w) => ['PROCESSING', 'FAILED', 'NEEDS_INPUT'].includes(w.status));
  const finishedWorks = works.filter((w) =>
    ['REVIEW_READY', 'APPROVED', 'PARTIALLY_PUBLISHED'].includes(w.status),
  );

  return (
    <div>
      <header className="page-head">
        <h1>流水线</h1>
        <p className="page-lead">
          池 → 苗 → 作 → 品：一条线索从入池到发布，在这一页追踪到每一站。
        </p>
        <button type="button" className="secondary" onClick={() => void load()}>
          刷新
        </button>
      </header>
      {err ? <p className="error">{err}</p> : null}

      {promoteTarget ? (
        <PromoteDialog
          seed={promoteTarget}
          clues={inPool}
          onDone={() => {
            setPromoteTarget(null);
            void load();
          }}
          onCancel={() => setPromoteTarget(null)}
        />
      ) : null}

      {/* 池：候选线索入池 + 小影问题转题苗 */}
      <section className="panel">
        <h3>池（候选 {candidate.length} · 已入池 {inPool.length}）</h3>
        {candidate.length === 0 && questions.length === 0 ? (
          <p className="muted">暂无待处理信号。</p>
        ) : null}
        {candidate.slice(0, 8).map((c) => (
          <div key={c.id} style={{ margin: '6px 0' }}>
            {c.body.slice(0, 60)}
            <button
              type="button"
              className="secondary"
              style={{ marginLeft: 10 }}
              onClick={() =>
                void run(async () => {
                  await adminApi.setPool(c.id, 'in-pool');
                  await load();
                })
              }
            >
              入池
            </button>
          </div>
        ))}
        {questions.length ? (
          <details style={{ marginTop: 8 }}>
            <summary className="muted">小影问题池（{questions.length}，前 5 条）</summary>
            {questions.slice(0, 5).map((q) => (
              <div key={q.id} style={{ margin: '6px 0' }}>
                {q.question.slice(0, 50)}
                <button
                  type="button"
                  className="secondary"
                  style={{ marginLeft: 10 }}
                  disabled={converted[q.id]}
                  onClick={() =>
                    void run(async () => {
                      await adminApi.createSeed(q.question.slice(0, 120));
                      setConverted((prev) => ({ ...prev, [q.id]: true }));
                    })
                  }
                >
                  {converted[q.id] ? '已转题苗' : '转题苗'}
                </button>
              </div>
            ))}
          </details>
        ) : null}
      </section>

      {/* 苗：待主选题苗（主选 = 人工五问，AI 不代选） */}
      <section className="panel">
        <h3>苗（待主选 {inboxSeeds.length}）</h3>
        {inboxSeeds.length === 0 ? (
          <p className="muted">没有待主选的题苗。</p>
        ) : (
          inboxSeeds.map((s) => (
            <div key={s.id} style={{ margin: '6px 0' }}>
              <strong>{s.title}</strong>
              {s.whyNow ? <span className="muted"> · 依据：{s.whyNow.slice(0, 36)}</span> : null}
              <button
                type="button"
                className="secondary"
                style={{ marginLeft: 10 }}
                disabled={inPool.length === 0}
                title={inPool.length === 0 ? '先在池段入池一条线索' : undefined}
                onClick={() => setPromoteTarget(s)}
              >
                主选（五问）
              </button>
            </div>
          ))
        )}
      </section>

      {/* 作：进行中的执行卡 + 运行中/失败的作品加工 */}
      <section className="panel">
        <h3>作（执行中 {doingExecs.length} · 加工中/失败 {activeWorks.length}）</h3>
        {doingExecs.length === 0 && activeWorks.length === 0 ? (
          <p className="muted">没有进行中的执行或加工。</p>
        ) : null}
        {doingExecs.map((e) => (
          <div key={e.id} className="muted" style={{ margin: '4px 0' }}>
            执行卡 {e.id.slice(0, 10)}… · {e.status}
          </div>
        ))}
        {activeWorks.map((w) => (
          <div key={w.id} style={{ margin: '6px 0' }}>
            <strong>{w.title}</strong>
            <span className="muted">
              {' '}
              {w.status}
              {w.waitingReason ? ` · ${w.waitingReason.slice(0, 40)}` : ''}
            </span>
            {w.status === 'PROCESSING' ? (
              <button
                type="button"
                className="secondary"
                style={{ marginLeft: 10 }}
                onClick={() =>
                  void run(async () => {
                    await adminApi.cancelWork(w.id);
                    await load();
                  })
                }
              >
                停止
              </button>
            ) : null}
            {w.status !== 'PROCESSING' ? (
              <button
                type="button"
                className="secondary"
                style={{ marginLeft: 10 }}
                onClick={() =>
                  void run(async () => {
                    await adminApi.produceWork(w.id); // 服务端从最近成功阶段续跑
                    await load();
                  })
                }
              >
                续跑
              </button>
            ) : null}
          </div>
        ))}
      </section>

      {/* 品：审阅批准 + 发布上线（诚实状态链） */}
      <section className="panel">
        <h3>品（待审 {finishedWorks.filter((w) => w.status === 'REVIEW_READY').length} · 待发布 {finishedWorks.filter((w) => w.status !== 'REVIEW_READY').length}）</h3>
        {finishedWorks.length === 0 ? (
          <p className="muted">还没有走到品段的作品。</p>
        ) : (
          finishedWorks.map((w) => {
            const review = reviews[w.id];
            const websitePub = publications[w.id]?.find((p) => p.channel === 'WEBSITE');
            return (
              <div key={w.id} style={{ margin: '10px 0', borderBottom: '1px solid rgba(127,150,160,.14)', paddingBottom: 8 }}>
                <strong>{w.title}</strong>
                <span className="muted"> · {w.status}</span>
                {websitePub ? (
                  <span className="muted"> · 网站：{websitePub.status}{websitePub.lastError ? `（${websitePub.lastError.slice(0, 30)}）` : ''}</span>
                ) : null}
                {w.status === 'REVIEW_READY' ? (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      style={{ marginLeft: 10 }}
                      onClick={() =>
                        void run(async () => {
                          const packet = await adminApi.getReview(w.id);
                          if (packet.candidate) {
                            setReviews((prev) => ({
                              ...prev,
                              [w.id]: { hash: packet.candidate!.hash, title: String(packet.candidate!.output.title ?? w.title) },
                            }));
                          }
                        })
                      }
                    >
                      审阅
                    </button>
                    <button
                      type="button"
                      style={{ marginLeft: 10 }}
                      disabled={!review}
                      title={review ? `按审阅包候选 ${review.hash.slice(0, 10)}… 批准` : '先审阅获取候选 hash'}
                      onClick={() =>
                        void run(async () => {
                          if (!review) return;
                          await adminApi.approveWork(w.id, review.hash);
                          await load();
                        })
                      }
                    >
                      批准
                    </button>
                    {review ? (
                      <div className="muted" style={{ marginTop: 4 }}>
                        候选：{review.title}（{review.hash.slice(0, 12)}…）
                      </div>
                    ) : null}
                  </>
                ) : null}
                {(w.status === 'APPROVED' || w.status === 'PARTIALLY_PUBLISHED') && w.approvedArtifactHash ? (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      style={{ marginLeft: 10 }}
                      onClick={() =>
                        void run(async () => {
                          const pub = await adminApi.publishWebsite(w.id, w.approvedArtifactHash!);
                          setHints((prev) => ({
                            ...prev,
                            [w.id]:
                              pub.status === 'PREPARED'
                                ? '文件已落盘 content/log：仓库根执行 pnpm content:publish --push 上线，Vercel 部署后再点「验证上线」。'
                                : `发布状态：${pub.status ?? ''}`,
                          }));
                          await load();
                        })
                      }
                    >
                      发布到网站
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      style={{ marginLeft: 10 }}
                      onClick={() =>
                        void run(async () => {
                          const pub = await adminApi.verifyWebsite(w.id);
                          setHints((prev) => ({
                            ...prev,
                            [w.id]: pub.status === 'PUBLISHED' ? `已上线：${pub.url ?? ''}` : `校验未通过：${pub.lastError ?? pub.status}`,
                          }));
                          await load();
                        })
                      }
                    >
                      验证上线
                    </button>
                  </>
                ) : null}
                {hints[w.id] ? <div className="muted" style={{ marginTop: 4 }}>{hints[w.id]}</div> : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
