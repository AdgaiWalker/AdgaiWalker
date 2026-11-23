import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 原生 <dialog> 模态框（遵循 modern-web-guidance `dialog`）：
 * - 使用 showModal() 获得顶层渲染、inert 背景、Esc 关闭与焦点归位；
 * - 不加多余的 role="dialog"/aria-modal；
 * - 使用 closedby="any" 并在 Safari 等不支持时用 boundingRect pointerdown+pointerup 回退。
 */
export function ModalDialog({
  open,
  title,
  onClose,
  dismissible = true,
  children,
  className = "",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };
    const handleCancel = (event: Event) => {
      if (!dismissible) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      onClose();
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);

    // Safari fallback for closedby="any" (bounding rect, not event.target)
    const supportsClosedBy = typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (dismissible && !supportsClosedBy) pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dismissible && !supportsClosedBy && pressedOutside && isOutside(e)) {
        pressedOutside = false;
        onClose();
      }
    };
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);

    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [dismissible, onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={`m-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      {...({ closedby: dismissible ? "any" : "none" } as Record<string, string>)}
    >
      <div className="m-dialog-head">
        <h2 id={titleId}>{title}</h2>
        {dismissible ? (
          <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="m-dialog-body">{children}</div>
    </dialog>
  );
}
