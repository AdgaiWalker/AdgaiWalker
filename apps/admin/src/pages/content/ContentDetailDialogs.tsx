import { UploadCloud } from "lucide-react";
import type { ContentVisibility } from "@walker/shared";
import { ModalDialog } from "../../components/ModalDialog";

interface ContentDetailDialogsProps {
  slug: string;
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
  deleteOpen: boolean;
  onCloseDelete: () => void;
  deletePending: boolean;
  onConfirmDelete: () => Promise<void>;
  isTrackedOnSite: boolean;
  blocker: { state: string; proceed?: () => void; reset?: () => void };
}

/** 文章编辑页三大高风险/离开确认弹窗：发布上线、删除下架与未保存离页拦截。 */
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
