import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** 右侧按需滑出抽屉（原生顶层 <dialog>）：pointerdown+pointerup 双判遮罩点击，避免拖选文字误关。 */
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
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
    if (!open || !dialog) return;
    let pressedOutside = false;
    const isOutsideSheet = (e: PointerEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return false;
      const r = sheet.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onCancel = (e: Event) => { e.preventDefault(); onCloseRef.current(); };
    const onPointerDown = (e: PointerEvent) => { pressedOutside = isOutsideSheet(e); };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutsideSheet(e)) {
        pressedOutside = false;
        onCloseRef.current();
      }
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog ref={ref} className="m-drawer" aria-labelledby={titleId}>
      <div ref={sheetRef} className="m-drawer-sheet">
        <div className="m-drawer-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="关闭抽屉" autoFocus onClick={() => onCloseRef.current()}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="m-drawer-body">{children}</div>
      </div>
    </dialog>
  );
}
