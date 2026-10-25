'use client';

import React from 'react';

export interface FilterChipItem {
  id?: string;
  key?: string;
  label: string;
  value: string;
  onClear?: () => void;
}

export type FilterChip = FilterChipItem;

interface ActiveFilterChipsProps {
  chips: FilterChipItem[];
  onRemove?: (key: string) => void;
  onClearAll: () => void;
  className?: string;
  resultCount?: number;
  totalCount?: number;
  totalAll?: number;
  countLabel?: string;
  filterTotalLabel?: string;
}

export function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
  className = '',
  resultCount,
  totalCount,
  totalAll,
  countLabel = 'kết quả',
  filterTotalLabel = 'Tổng filter',
}: ActiveFilterChipsProps) {
  if (!chips || chips.length === 0) return null;

  const count = typeof totalCount === 'number' ? totalCount : resultCount;

  return (
    <div className={`d-flex flex-wrap align-items-center gap-1.5 py-1 ${className}`}>
      <span className="text-muted fw-bold small me-1 d-inline-flex align-items-center gap-1" style={{ fontSize: '0.75rem' }}>
        <i className="fas fa-filter fa-xs text-primary"></i>
        <span>Đang lọc:</span>
      </span>
      {typeof count === 'number' && (
        <span
          className="badge bg-white text-dark border border-primary-subtle px-2.5 py-1 fw-semibold rounded-pill d-inline-flex align-items-center gap-1.5 shadow-2xs me-1"
          style={{ fontSize: '0.75rem' }}
          title={`Tìm thấy ${count.toLocaleString('vi-VN')} ${countLabel} phù hợp với các bộ lọc`}
        >
          <i className="fas fa-calculator text-primary" style={{ fontSize: '10px' }}></i>
          <span className="text-secondary">{filterTotalLabel}:</span>
          <strong className={count === 0 ? 'text-danger' : 'text-primary'}>
            {count.toLocaleString('vi-VN')}
          </strong>
          {typeof totalAll === 'number' && totalAll > 0 && (
            <span className="text-muted fw-normal font-monospace">/ {totalAll.toLocaleString('vi-VN')}</span>
          )}
          <span className="text-secondary">{countLabel}</span>
        </span>
      )}
      {chips.map((chip) => {
        const chipKey = chip.id || chip.key || chip.label;
        const handleClear = () => {
          if (chip.onClear) chip.onClear();
          else if (onRemove && (chip.key || chip.id)) onRemove((chip.key || chip.id)!);
        };
        return (
          <span key={chipKey} className="filter-chip">
            <span className="text-muted">{chip.label}:</span>
            <strong>{chip.value}</strong>
            <span
              className="filter-chip-remove"
              onClick={handleClear}
              title={`Bỏ lọc ${chip.label}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleClear();
                }
              }}
            >
              &times;
            </span>
          </span>
        );
      })}
      <button
        type="button"
        className="btn btn-link btn-sm text-danger text-decoration-none p-0 ms-1 fw-medium"
        style={{ fontSize: '0.75rem' }}
        onClick={onClearAll}
      >
        <i className="fas fa-trash-alt fa-xs me-1"></i>Xóa tất cả
      </button>
    </div>
  );
}

export default ActiveFilterChips;
