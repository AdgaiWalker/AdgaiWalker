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
  const [draft, setDraft] = useState<File | null>(null);
  const [brief, setBrief] = useState({ audience: '', scenario: '', problem: '', keyQuestion: '', intendedAction: '' });
  const [artifactHashes, setArtifactHashes] = useState<Record<string, string>>({});
  const [failedStages, setFailedStages] = useState<Record<string, string>>({});
  const [exportDestination, setExportDestination] = useState('');
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => setSnapshot(await adminApi.workbench()));
  }, [run]);

  useEffect(() => { void load(); }, [load]);

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
          if (!draft) return;
          void run(async () => {
            await adminApi.createWork({
              idempotencyKey: `admin-${Date.now()}`,
              title, sourceProblem: problem, whyNow, coreViewpoint: viewpoint,
              protectedClaims: [], contentBrief: brief, draft,
            });
            setTitle(''); setProblem(''); setWhyNow(''); setViewpoint(''); setDraft(null);
            await load();
          });
        }}>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>Core viewpoint<textarea value={viewpoint} onChange={(event) => setViewpoint(event.target.value)} required /></label>
          <label>Source problem<textarea value={problem} onChange={(event) => setProblem(event.target.value)} required /></label>
          <label>Why now<input value={whyNow} onChange={(event) => setWhyNow(event.target.value)} required /></label>
          <div className="workstation-brief-grid">
            {(Object.keys(brief) as Array<keyof typeof brief>).map((key) => (
              <label key={key}>{key}<input value={brief[key]} onChange={(event) => updateBrief(key, event.target.value)} required /></label>
            ))}
          </div>
          <label>Human draft<input type="file" accept=".md,.mdx,.txt,text/markdown,text/plain" onChange={(event) => setDraft(event.target.files?.[0] ?? null)} required /></label>
          <button type="submit">Create draft work</button>
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
            const hash = artifactHashes[work.id] ?? work.approvedArtifactHash ?? '';
            const failedStage = failedStages[work.id];
            return <div className="workstation-mini-row" key={work.id}>
              <strong>{work.title}</strong><span>{work.status}</span>
              {work.status === 'PROCESSING' ? <button type="button" className="secondary" onClick={() => void run(async () => { await adminApi.cancelWork(work.id); await load(); })}>Stop</button> : null}
              <button type="button" className="secondary" disabled={work.status === 'CANCELLED'} onClick={() => void run(async () => {
                const result = await adminApi.produceWork(work.id, failedStage ? { fromStage: failedStage } : undefined);
                if (result.latestHash) setArtifactHashes((current) => ({ ...current, [work.id]: result.latestHash! }));
                if (result.failedStage) setFailedStages((current) => ({ ...current, [work.id]: result.failedStage! }));
                else setFailedStages((current) => { const next = { ...current }; delete next[work.id]; return next; });
                await load();
              })}>{failedStage ? `Retry from ${failedStage}` : 'Run recipe'}</button>
              {hash && (work.status === 'REVIEW_READY' || work.status === 'APPROVED' || work.status === 'PARTIALLY_PUBLISHED') ? <>
                {work.status === 'REVIEW_READY' ? <button type="button" onClick={() => void run(async () => { await adminApi.approveWork(work.id, hash); await load(); })}>Approve</button> : null}
                {work.status === 'APPROVED' || work.status === 'PARTIALLY_PUBLISHED' ? <button type="button" className="secondary" onClick={() => void run(async () => { await adminApi.publishWebsite(work.id, hash); await load(); })}>Website</button> : null}
                <button type="button" className="secondary" onClick={() => void run(async () => { await adminApi.prepareWechatDraft(work.id, hash); await load(); })}>WeChat draft</button>
                {exportDestination.trim() ? <button type="button" className="secondary" onClick={() => void run(async () => { await adminApi.exportWork(work.id, exportDestination); await load(); })}>Export work</button> : null}
              </> : null}
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
