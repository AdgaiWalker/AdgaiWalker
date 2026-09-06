import { useCallback, useEffect, useState } from 'react';
import { adminApi, type WorkbenchSnapshot } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

type ScaffoldStatus = 'READY' | 'NOT_IMPLEMENTED';

export interface WorkstationScaffoldItem {
  title: string;
  description: string;
  status: ScaffoldStatus;
}

export const WORKSTATION_FOUNDATIONS: readonly WorkstationScaffoldItem[] = [
  {
    title: '选题契约',
    description: '收件箱、候选、已主选、已归档四种状态。',
    status: 'READY',
  },
  {
    title: '行动契约',
    description: '日期可空，支持任务、视频以及完成后恢复。',
    status: 'READY',
  },
  {
    title: '作品契约',
    description: '保护核心观点、原稿与附件，后续阶段不可覆盖原始材料。',
    status: 'READY',
  },
] as const;

export const WORKSTATION_PIPELINE: readonly WorkstationScaffoldItem[] = [
  {
    title: '原稿入库',
    description: '上传人工初稿，原稿清单和字节保持不可变。',
    status: 'READY',
  },
  {
    title: 'AI 加工',
    description: '按固定配方逐阶段生成 Artifact，失败后从最近成功阶段重试。',
    status: 'READY',
  },
  {
    title: '审批与发布',
    description: '审批不可变版本，生成网站文件、公众号草稿包，并支持整包导出。',
    status: 'READY',
  },
] as const;

const STATUS_LABEL: Record<ScaffoldStatus, string> = {
  READY: '可运行',
  NOT_IMPLEMENTED: '待接入',
};

function ScaffoldCard({ item }: { item: WorkstationScaffoldItem }) {
  return (
    <article className="workstation-card">
      <div className="workstation-card-head">
        <h3>{item.title}</h3>
        <span
          className={`status-dot${item.status === 'READY' ? ' is-ready' : ''}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </div>
      <p>{item.description}</p>
    </article>
  );
}

function LiveWorkbench() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [whyNow, setWhyNow] = useState('');
  const [viewpoint, setViewpoint] = useState('');
  const [links, setLinks] = useState('');
  const [draft, setDraft] = useState<File | null>(null);
  const [brief, setBrief] = useState({ audience: '', scenario: '', problem: '', keyQuestion: '', intendedAction: '' });
  const [failedStages, setFailedStages] = useState<Record<string, string>>({});
  const [reviewPackets, setReviewPackets] = useState<Record<string, Awaited<ReturnType<typeof adminApi.getReview>>>>({});
  const [publications, setPublications] = useState<Record<string, Array<{ channel: string; status: string; url: string | null; lastError: string | null }>>>({});
  const [publishHints, setPublishHints] = useState<Record<string, string>>({});
  const [exportDestination, setExportDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 幂等键按「一份草稿」保持稳定：重试不重复建 work；新建成功后才换新键
  const [draftKey, setDraftKey] = useState(() => `admin-${Date.now()}`);
  const { err, run } = useAdminAction();

  /** 纯读取：不自带错误处理，由调用方的 run 统一兜住（避免外层成功清除内层失败） */
  const load = useCallback(async () => {
    setSnapshot(await adminApi.workbench());
  }, []);

  /** 审阅包与发布记录都从服务端恢复：刷新页面不丢 Review/Approve/发布状态入口 */
  const loadWorkState = useCallback(async (workId: string) => {
    const [packet, pubs] = await Promise.all([adminApi.getReview(workId), adminApi.workPublications(workId)]);
    setReviewPackets((current) => ({ ...current, [workId]: packet }));
    setPublications((current) => ({ ...current, [workId]: pubs }));
  }, []);

  useEffect(() => {
    void run(async () => {
      await load();
      try {
        const works = await adminApi.works();
        await Promise.all(works.filter((w) => ['REVIEW_READY', 'APPROVED', 'PARTIALLY_PUBLISHED'].includes(w.status)).map((w) => loadWorkState(w.id)));
      } catch {
        // 审阅包/发布记录恢复失败不阻塞列表展示；操作时再按需拉取
      }
    });
  }, [load, loadWorkState, run]);

  const updateBrief = (key: keyof typeof brief, value: string) => setBrief((current) => ({ ...current, [key]: value }));

  return (
    <section className="panel workstation-live" aria-labelledby="live-workbench-title">
      <div className="workstation-section-head">
        <div>
          <h2 id="live-workbench-title">Live workbench</h2>
          <p>Create one human-owned draft and inspect the persisted work snapshot.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()}>Refresh</button>
      </div>
      <div className="workstation-live-grid">
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!draft || submitting) return;
          void run(async () => {
            setSubmitting(true);
            try {
              await adminApi.createWork({
                idempotencyKey: draftKey,
                title, sourceProblem: problem, whyNow, coreViewpoint: viewpoint,
                protectedClaims: [], contentBrief: brief, links: links.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean), draft,
              });
              setTitle(''); setProblem(''); setWhyNow(''); setViewpoint(''); setLinks(''); setDraft(null);
              setDraftKey(`admin-${Date.now()}`);
              await load();
            } finally {
              setSubmitting(false);
            }
          });
        }}>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>Core viewpoint<textarea value={viewpoint} onChange={(event) => setViewpoint(event.target.value)} required /></label>
          <label>Source problem<textarea value={problem} onChange={(event) => setProblem(event.target.value)} required /></label>
          <label>Why now<input value={whyNow} onChange={(event) => setWhyNow(event.target.value)} required /></label>
          <label>Source links<textarea value={links} onChange={(event) => setLinks(event.target.value)} placeholder="One URL per line (optional)" /></label>
          <div className="workstation-brief-grid">
            {(Object.keys(brief) as Array<keyof typeof brief>).map((key) => (
              <label key={key}>{key}<input value={brief[key]} onChange={(event) => updateBrief(key, event.target.value)} required /></label>
            ))}
          </div>
          <label>Human draft<input type="file" accept=".md,.mdx,.txt,text/markdown,text/plain" onChange={(event) => setDraft(event.target.files?.[0] ?? null)} required /></label>
          <button type="submit" disabled={submitting}>{submitting ? '创建中…' : 'Create draft work'}</button>
          {err ? <p className="error">{err}</p> : null}
        </form>
        <div>
          <h3>Current snapshot</h3>
          <label>Export directory<input value={exportDestination} onChange={(event) => setExportDestination(event.target.value)} placeholder="D:\\exports" /></label>
          <p className="muted">Topics: {snapshot?.topics.length ?? '—'}</p>
          <p className="muted">Open actions: {snapshot?.openActions.length ?? '—'}</p>
          <p className="muted">Video log: {snapshot?.videoLog.length ?? '—'}</p>
          <p className="muted">Works: {snapshot?.activeWorks.length ?? '—'}</p>
          {snapshot?.activeWorks.map((work) => {
            const failedStage = failedStages[work.id];
            const packet = reviewPackets[work.id];
            const candidateHash = packet?.candidate?.hash ?? null;
            const approvedHash = work.approvedArtifactHash;
            const reviewable = work.status === 'REVIEW_READY' || work.status === 'APPROVED' || work.status === 'PARTIALLY_PUBLISHED';
            const publishable = (work.status === 'APPROVED' || work.status === 'PARTIALLY_PUBLISHED') && approvedHash;
            const websitePub = publications[work.id]?.find((p) => p.channel === 'WEBSITE') ?? null;
            return <div className="workstation-mini-row" key={work.id}>
              <strong>{work.title}</strong><span>{work.status}{work.currentStage ? ` · ${work.currentStage}` : ''}</span>
              {work.stageStartedAt ? <small className="muted">started {new Date(work.stageStartedAt).toLocaleTimeString()}</small> : null}
              {work.waitingReason ? <small className="error">{work.waitingReason}</small> : null}
              {work.status === 'PROCESSING' ? <button type="button" className="secondary" onClick={() => void run(async () => { await adminApi.cancelWork(work.id); await load(); })}>Stop</button> : null}
              <button type="button" className="secondary" disabled={work.status === 'CANCELLED'} onClick={() => void run(async () => {
                const result = await adminApi.produceWork(work.id, failedStage ? { fromStage: failedStage } : undefined);
                if (result.failedStage) setFailedStages((current) => ({ ...current, [work.id]: result.failedStage! }));
                else setFailedStages((current) => { const next = { ...current }; delete next[work.id]; return next; });
                await load();
                await loadWorkState(work.id);
              })}>{failedStage ? `Retry from ${failedStage}` : 'Run recipe'}</button>
              {reviewable ? <>
                <button type="button" className="secondary" onClick={() => void run(async () => { await loadWorkState(work.id); })}>Review</button>
                {work.status === 'REVIEW_READY' ? <button type="button" disabled={!candidateHash} onClick={() => void run(async () => {
                  // 审批绑定服务端审阅包里的候选 hash：所见即所批，刷新后仍可恢复
                  let hashForApproval = candidateHash;
                  if (!hashForApproval) {
                    const fresh = await adminApi.getReview(work.id);
                    setReviewPackets((current) => ({ ...current, [work.id]: fresh }));
                    hashForApproval = fresh.candidate?.hash ?? null;
                  }
                  if (!hashForApproval) throw new Error('没有可审批的候选（先运行配方到 REVIEW_READY）');
                  await adminApi.approveWork(work.id, hashForApproval);
                  await load();
                })}>Approve</button> : null}
              </> : null}
              {publishable ? <>
                <button type="button" className="secondary" onClick={() => void run(async () => {
                  const pub = await adminApi.publishWebsite(work.id, approvedHash);
                  await loadWorkState(work.id);
                  setPublishHints((current) => ({
                    ...current,
                    [work.id]: pub.status === 'PREPARED'
                      ? '内容文件已保存到 content/log。下一步：pnpm content:publish --push 上线，Vercel 部署完成后再点 Verify website。'
                      : `发布状态：${pub.status}${pub.lastError ? `（${pub.lastError}）` : ''}`,
                  }));
                  await load();
                })}>Website</button>
                <button type="button" className="secondary" onClick={() => void run(async () => {
                  const pub = await adminApi.verifyWebsite(work.id);
                  await loadWorkState(work.id);
                  setPublishHints((current) => ({
                    ...current,
                    [work.id]: pub.status === 'PUBLISHED' ? `已上线：${pub.url ?? ''}` : `校验未通过：${pub.lastError ?? pub.status}`,
                  }));
                  await load();
                })}>Verify website</button>
                <button type="button" className="secondary" onClick={() => void run(async () => { await adminApi.prepareWechatDraft(work.id, approvedHash); await load(); })}>WeChat draft</button>
                {exportDestination.trim() ? <button type="button" className="secondary" onClick={() => void run(async () => { await adminApi.exportWork(work.id, exportDestination); await load(); })}>Export work</button> : null}
              </> : null}
              {websitePub ? <small className="muted">网站发布：{websitePub.status}{websitePub.url ? ` · ${websitePub.url}` : ''}{websitePub.lastError ? ` · ${websitePub.lastError}` : ''}</small> : null}
              {publishHints[work.id] ? <small className="muted">{publishHints[work.id]}</small> : null}
              {packet ? <details className="workstation-review" open>
                <summary>Review packet（候选 {packet.candidate ? packet.candidate.hash.slice(0, 10) : '—'}）</summary>
                {packet.candidate ? <>
                  <p><strong>候选标题：</strong>{String(packet.candidate.output.title ?? '')}</p>
                  <details>
                    <summary>完整候选正文（审批即批准此版本）</summary>
                    <pre className="workstation-candidate">{String(packet.candidate.output.markdown ?? packet.candidate.output.body ?? '')}</pre>
                  </details>
                </> : <p className="muted">暂无候选（先运行配方）</p>}
                <details>
                  <summary>原稿全文</summary>
                  <pre className="workstation-candidate">{packet.original.text ?? 'not readable'}</pre>
                </details>
                <p><strong>Core viewpoint:</strong> {packet.original.coreViewpoint}</p>
                <p><strong>Risks:</strong> {JSON.stringify(packet.risks ?? {})}</p>
                <p><strong>Edits:</strong> {JSON.stringify(packet.edits ?? {})}</p>
                <p><strong>Covers:</strong> {packet.covers ? 'portrait + landscape ready' : 'missing'}</p>
                <p><strong>Platforms:</strong> {packet.platforms.website ? 'website ready' : 'website missing'} / {packet.platforms.wechat ? 'wechat ready' : 'wechat missing'}</p>
              </details> : null}
            </div>;
          })}
        </div>
      </div>
    </section>
  );
}

export function WorkstationPage() {
  return (
    <div>
      <header className="page-head">
        <p className="workstation-eyebrow">AI content operations</p>
        <h1>AI 自媒体工作站</h1>
        <p className="page-lead">
          从人工初稿开始，沿着固定生产配方完成审批、网站发布和公众号草稿准备。
        </p>
      </header>

      <section className="panel workstation-notice" aria-label="当前状态">
        <div>
          <strong>当前工作状态</strong>
          <p>
            每个作品都保留原稿、阶段 Artifact、审批哈希和发布准备包；失败时可以从最近成功阶段恢复。
          </p>
        </div>
        <span className="status-dot is-ready">MVP 可运行</span>
      </section>

      <section aria-labelledby="foundation-title">
        <div className="workstation-section-head">
          <div>
            <h2 id="foundation-title">已经立住的地基</h2>
            <p>后续 API、数据库和页面都以这些共享状态为准。</p>
          </div>
        </div>
        <div className="workstation-grid">
          {WORKSTATION_FOUNDATIONS.map((item) => (
            <ScaffoldCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <LiveWorkbench />

      <section aria-labelledby="pipeline-title">
        <div className="workstation-section-head">
          <div>
            <h2 id="pipeline-title">作品生产闭环</h2>
            <p>先创建一篇人工初稿，再按顺序运行、审批、发布或导出。</p>
          </div>
        </div>
        <div className="workstation-grid">
          {WORKSTATION_PIPELINE.map((item) => (
            <ScaffoldCard key={item.title} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
