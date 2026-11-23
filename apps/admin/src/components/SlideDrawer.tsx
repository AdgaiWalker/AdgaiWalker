import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 右侧按需滑出抽屉（原生顶层 <dialog> 实现）：
 * 平时不挂载，触发时滑入，点击遮罩/Esc/关闭按钮退场并自动归位焦点。
 */
export function SlideDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
    } else if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("click", onClick);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("click", onClick);
    };
  }, [onClose]);

  if (!open) return null;

  return (
    <dialog ref={ref} className="m-drawer" aria-labelledby={titleId}>
      <div ref={sheetRef} className="m-drawer-sheet">
        <div className="m-drawer-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="关闭抽屉" autoFocus onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="m-drawer-body">{children}</div>
      </div>
    </dialog>
  );
}
