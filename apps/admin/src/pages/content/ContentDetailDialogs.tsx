import { useId, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { ContentVisibility } from "@walker/shared";
import { ModalDialog } from "../../components/ModalDialog";
import { autoSlug } from "../../shared/frontmatter";

interface ContentDetailDialogsProps {
  slug: string;
  sourceTitle: string;
  publishOpen: boolean;
  onClosePublish: () => void;
  onSubmitPublish: (e: React.FormEvent) => Promise<void>;
  visibility: ContentVisibility;
  published?: boolean;
  onPromotePublic: () => void;
  versionNote: string;
  onVersionNoteChange: (value: string) => void;
  publishing: boolean;
  errorMessage: string | null;
  versionCount: number;
  unchangedPublished: boolean;
  onOpenContinue?: () => void;
  continueOpen: boolean;
  onCloseContinue: () => void;
  onSubmitContinue: (input: { title: string; slug: string; series: string }) => Promise<void>;
  existingSeries: string[];
  existingSlugs: ReadonlySet<string>;
  defaultSeries: string;
  computeNextOrder: (series: string) => number;
  continueSaving: boolean;
  continueError: string | null;
  deleteOpen: boolean;
  onCloseDelete: () => void;
  deletePending: boolean;
  onConfirmDelete: () => Promise<void>;
  isTrackedOnSite: boolean;
  blocker: { state: string; proceed?: () => void; reset?: () => void };
}

function ContinueForm(props: {
  sourceSlug: string; existingSeries: string[]; existingSlugs: ReadonlySet<string>; defaultSeries: string;
  computeNextOrder: (series: string) => number; saving: boolean; error: string | null; onClose: () => void;
  onSubmit: (input: { title: string; slug: string; series: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [series, setSeries] = useState(props.defaultSeries);
  const listId = useId();
  const cleanSeries = series.trim();

  return (
    <form onSubmit={(e) => { e.preventDefault(); void props.onSubmit({ title, slug: slug.trim() || autoSlug(title, props.existingSlugs), series }); }} className="stack">
      <label className="field-col">标题
        <input type="text" autoFocus required placeholder="输入续篇标题" value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(autoSlug(e.target.value, props.existingSlugs)); }} />
      </label>
      <label className="field-col">路径标识 (slug)
        <input type="text" required className="mono" placeholder="my-next-post" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} />
      </label>
      <label className="field-col">所属系列（可选）
        <input type="text" list={listId} placeholder="留空则不归入系列" value={series} onChange={(e) => setSeries(e.target.value)} />
        <datalist id={listId}>{props.existingSeries.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      <p className="muted" style={{ margin: 0 }}>
        {cleanSeries ? `将自动排为「${cleanSeries}」第 ${props.computeNextOrder(cleanSeries)} 篇，并在开头链接 [[${props.sourceSlug}]]` : `将在正文开头链接 [[${props.sourceSlug}]]，与前文自动互连`}
      </p>
      {props.error ? <p className="error-text" role="alert">{props.error}</p> : null}
      <div className="action-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={props.onClose}>取消</button>
        <button type="submit" className="btn btn-primary" disabled={props.saving}>{props.saving ? "创建中…" : "创建草稿并写作"}</button>
      </div>
    </form>
  );
}

/** 文章编辑页高频与高风险弹窗：发布上线、续写下一篇、删除下架与未保存离页拦截。 */
export function ContentDetailDialogs(props: ContentDetailDialogsProps) {
  return (
    <>
      <ModalDialog open={props.publishOpen} title="发布上线" onClose={props.onClosePublish}>
        <form onSubmit={(e) => void props.onSubmitPublish(e)} className="stack">
          {props.visibility === "draft" || props.published === false ? (
            <p className="notice" style={{ margin: 0 }}>当前为草稿，发布上线时将自动转为公开可见。</p>
          ) : props.visibility === "private" ? (
            <div className="notice" style={{ margin: 0, justifyContent: "space-between" }}>
              <span>当前为私密文章，无法直接公开发布。</span>
              <button type="button" className="btn" onClick={props.onPromotePublic}>转为公开</button>
            </div>
          ) : null}
          {props.unchangedPublished && props.versionCount > 0 ? (
            <div className="notice" style={{ margin: 0, justifyContent: "space-between", gap: 8 }}>
              <span>
                当前已是线上 v{props.versionCount} 且正文无改动：直接发布不会生成新版本。修改正文后发布将保留旧版并生成 v{props.versionCount + 1}；若想承接写一篇新文章：
              </span>
              {props.onOpenContinue ? (
                <button type="button" className="btn" onClick={props.onOpenContinue}>续写下一篇</button>
              ) : null}
            </div>
          ) : props.versionCount > 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              上线确证后将生成 v{props.versionCount + 1}（{props.versionCount === 1 ? "v1" : `v1–v${props.versionCount}`} 永久保留在版本历史中）。
            </p>
          ) : null}
          <label className="field-col">
            变更说明（将公开显示在版本历史中）
            <input
              type="text" autoFocus required placeholder="例如：补充一线案例 / 修正错别字" value={props.versionNote}
              onChange={(e) => props.onVersionNoteChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && props.visibility !== "private") {
                  e.preventDefault();
                  void props.onSubmitPublish(e);
                }
              }}
            />
          </label>
          {props.errorMessage ? <p className="error-text" role="alert">{props.errorMessage}</p> : null}
          <div className="action-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={props.onClosePublish}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={props.publishing || props.visibility === "private" || !props.versionNote.trim()}>
              <UploadCloud size={14} />{props.publishing ? "正在推送…" : "发布上线"}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={props.continueOpen} title="续写下一篇" onClose={props.onCloseContinue}>
        <ContinueForm
          sourceSlug={props.slug}
          existingSeries={props.existingSeries}
          existingSlugs={props.existingSlugs}
          defaultSeries={props.defaultSeries}
          computeNextOrder={props.computeNextOrder}
          saving={props.continueSaving}
          error={props.continueError}
          onClose={props.onCloseContinue}
          onSubmit={props.onSubmitContinue}
        />
      </ModalDialog>

      <ModalDialog open={props.deleteOpen} title={props.isTrackedOnSite ? "确认删除并下架文章？" : "确认删除草稿？"} onClose={props.onCloseDelete}>
        <p className="muted">
          {props.isTrackedOnSite
            ? `将删除 content/log/${props.slug} 并推送 GitHub 触发网站下架（content/versions 历史版本仍保留）。`
            : `将删除本地草稿 content/log/${props.slug}，未保存修改无法找回。`}
        </p>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" autoFocus onClick={props.onCloseDelete}>取消</button>
          <button type="button" className="btn btn-danger" disabled={props.deletePending} onClick={() => void props.onConfirmDelete()}>
            {props.deletePending ? "处理中…" : props.isTrackedOnSite ? "确认删除并下架" : "确认删除"}
          </button>
        </div>
      </ModalDialog>

      <ModalDialog open={props.blocker.state === "blocked"} title="有未保存的改动" dismissible={false} onClose={() => props.blocker.reset?.()}>
        <p className="muted">离开当前页面将丢失刚写的内容。</p>
        <div className="action-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => props.blocker.proceed?.()}>放弃并离开</button>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => props.blocker.reset?.()}>留下继续编辑</button>
        </div>
      </ModalDialog>
    </>
  );
}
