'use client';

import React from 'react';

interface BatchActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  children: React.ReactNode;
}

export default function BatchActionBar({
  selectedCount,
  onClearSelection,
  children,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="batch-action-bar position-fixed shadow-lg d-flex align-items-center justify-content-between flex-wrap gap-2 px-3 py-2 bg-dark text-white"
      style={{
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1050,
        borderRadius: '50px',
        maxWidth: '92vw',
        minWidth: '280px',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
      }}
      role="toolbar"
      aria-label="Thao tác hàng loạt"
    >
      <div className="d-flex align-items-center gap-2">
        <span className="badge bg-primary rounded-pill px-2 py-1 fw-bold" style={{ fontSize: '0.85rem' }}>
          {selectedCount}
        </span>
        <span className="small fw-semibold d-none d-sm-inline">đã chọn</span>
        <button
          type="button"
          className="btn btn-outline-light btn-sm rounded-circle p-0 d-flex align-items-center justify-content-center"
          style={{ width: '22px', height: '22px', fontSize: '0.7rem' }}
          onClick={onClearSelection}
          title="Bỏ chọn tất cả"
          aria-label="Bỏ chọn tất cả"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="d-flex align-items-center gap-2 flex-wrap">
        {children}
      </div>
    </div>
  );
}
