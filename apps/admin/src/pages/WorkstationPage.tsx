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
    description: '上传与不可变哈希将在下一步接入持久化。',
    status: 'NOT_IMPLEMENTED',
  },
  {
    title: 'AI 加工',
    description: '结构、质量检查、封面与公众号排版尚未接入。',
    status: 'NOT_IMPLEMENTED',
  },
  {
    title: '审批与发布',
    description: '统一审批、网站发布和公众号草稿准备尚未接入。',
    status: 'NOT_IMPLEMENTED',
  },
] as const;

const STATUS_LABEL: Record<ScaffoldStatus, string> = {
  READY: '骨架已建立',
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

export function WorkstationPage() {
  return (
    <div>
      <header className="page-head">
        <p className="workstation-eyebrow">Slice 1 · Scaffold</p>
        <h1>AI 自媒体工作站</h1>
        <p className="page-lead">
          先固定一篇作品从人工初稿到发布准备的业务骨架，再逐段接入真实能力。
        </p>
      </header>

      <section className="panel workstation-notice" aria-label="当前状态">
        <div>
          <strong>当前只完成脚手架</strong>
          <p>
            状态契约和页面入口可继续开发；数据持久化、AI 加工、审批和发布均未实现。
          </p>
        </div>
        <span className="status-dot">不可用于真实发布</span>
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

      <section aria-labelledby="pipeline-title">
        <div className="workstation-section-head">
          <div>
            <h2 id="pipeline-title">接下来接入的闭环</h2>
            <p>每一段都必须有真实结果和失败恢复证据后，才会显示为可用。</p>
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
