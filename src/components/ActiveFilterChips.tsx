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
}

export function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
  className = '',
}: ActiveFilterChipsProps) {
  if (!chips || chips.length === 0) return null;

  return (
    <div className={`d-flex flex-wrap align-items-center gap-1 py-1 mb-2 ${className}`}>
      <span className="text-muted fw-bold small me-1" style={{ fontSize: '0.75rem' }}>
        <i className="fas fa-filter fa-xs me-1 text-primary"></i>Đang lọc:
      </span>
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
