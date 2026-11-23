import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** 原生 <dialog> 模态框：showModal + 稳定事件绑定（依赖 open，用 ref 持有 onClose）+ Safari 遮罩回退。 */
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const handleClose = () => {
      dialog.returnValue = "";
      onCloseRef.current();
    };
    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (dismissible) onCloseRef.current();
    };
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
        onCloseRef.current();
      }
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [open, dismissible]);

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
          <button type="button" className="icon-btn" aria-label="关闭" onClick={() => onCloseRef.current()}>
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="m-dialog-body">{children}</div>
    </dialog>
  );
}
