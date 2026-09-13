/**
 * AppleSheetModal — 通用 Apple 弹性半透明 Sheet 模态容器 (DRY)
 */
import type { ReactNode } from 'react';

export interface AppleSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  actions: ReactNode;
}

export function AppleSheetModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  actions,
}: AppleSheetModalProps) {
  return (
    <div
      className={`apple-modal-scrim${isOpen ? ' show' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="apple-modal-sheet">
        <h3 className="modal-title">{title}</h3>
        <p className="modal-desc">{description}</p>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
