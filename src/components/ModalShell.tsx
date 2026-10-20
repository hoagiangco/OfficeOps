'use client';

import React from 'react';

interface ModalShellProps {
  show?: boolean;
  open?: boolean;
  title: string;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  headerClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ModalShell({
  show,
  open,
  title,
  onClose,
  size = 'md',
  headerClass = 'bg-primary text-white',
  children,
  footer,
}: ModalShellProps) {
  const isVisible = show ?? open ?? false;
  if (!isVisible) return null;

  const sizeClass =
    size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : '';

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)', zIndex: 1060 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${sizeClass}`}>
        <div className="modal-content border-0 shadow rounded-3">
          <div className={`modal-header py-2 px-3 border-0 ${headerClass}`}>
            <h6 className="modal-title fw-bold mb-0">{title}</h6>
            <button
              type="button"
              className="btn-close btn-close-white btn-close-sm"
              onClick={onClose}
              aria-label="Đóng"
            ></button>
          </div>
          <div className="modal-body p-3">{children}</div>
          {footer && <div className="modal-footer py-2 px-3 bg-light border-top">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export default ModalShell;
