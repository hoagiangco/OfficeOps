'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';

function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  level?: number;
  icon?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  allowClear?: boolean;
  maxHeight?: number | string;
  menuMinWidth?: number | string;
  alignMenu?: 'left' | 'right';
  renderTriggerLabel?: (option: SelectOption) => React.ReactNode;
  prefixIcon?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '-- Chọn --',
  searchPlaceholder = 'Tìm kiếm...',
  disabled = false,
  className = '',
  style,
  allowClear = false,
  maxHeight = 240,
  menuMinWidth,
  alignMenu = 'left',
  renderTriggerLabel,
  prefixIcon,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openUpwards, setOpenUpwards] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>(240);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  // Normalize options
  const normalizedOptions: SelectOption[] = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  // Current selected option
  const selectedOption = useMemo(() => {
    return normalizedOptions.find((opt) => opt.value === value);
  }, [normalizedOptions, value]);

  // Filtered options based on search query (hỗ trợ cả tiếng Việt có dấu và không dấu)
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return normalizedOptions;
    const rawQuery = search.toLowerCase().trim();
    const cleanQuery = removeVietnameseTones(search);

    return normalizedOptions.filter((opt) => {
      const label = opt.label.toLowerCase();
      const sublabel = (opt.sublabel || '').toLowerCase();
      const badge = (opt.badge || '').toLowerCase();

      if (label.includes(rawQuery) || sublabel.includes(rawQuery) || badge.includes(rawQuery)) {
        return true;
      }

      const cleanLabel = removeVietnameseTones(opt.label);
      const cleanSublabel = removeVietnameseTones(opt.sublabel || '');
      const cleanBadge = removeVietnameseTones(opt.badge || '');

      return (
        cleanLabel.includes(cleanQuery) ||
        cleanSublabel.includes(cleanQuery) ||
        cleanBadge.includes(cleanQuery)
      );
    });
  }, [normalizedOptions, search]);

  // Tự động cuộn đến item được highlight bằng phím mũi tên
  useEffect(() => {
    if (optionsListRef.current && highlightedIndex >= 0) {
      const activeEl = optionsListRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto-focus search input & calculate placement when opened
  useEffect(() => {
    if (isOpen) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Auto flip up if bottom space is cramped and top has more room
        const flipUp = spaceBelow < 250 && spaceAbove > spaceBelow;
        setOpenUpwards(flipUp);

        const available = Math.max(160, Math.min(280, (flipUp ? spaceAbove : spaceBelow) - 80));
        setMenuMaxHeight(available);
      }
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Xử lý chặn cuộn trang nền và chuyển hướng cuộn vào danh sách item
  useEffect(() => {
    const dropdown = dropdownMenuRef.current;
    const list = optionsListRef.current;
    if (!isOpen || !dropdown || !list) return;

    const handleWheel = (e: WheelEvent) => {
      // Dừng lan truyền sự kiện cuộn ra ngoài (modal / window / background page)
      e.stopPropagation();

      const { scrollTop, scrollHeight, clientHeight } = list;
      const canScroll = scrollHeight > clientHeight;

      if (canScroll) {
        const canScrollDown = e.deltaY > 0 && scrollTop + clientHeight < scrollHeight;
        const canScrollUp = e.deltaY < 0 && scrollTop > 0;

        if (canScrollDown || canScrollUp) {
          list.scrollTop += e.deltaY;
        }
      }
      // Luôn chặn cuộn trang phía sau khi con trỏ chuột nằm trong menu select
      e.preventDefault();
    };

    dropdown.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      dropdown.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`position-relative w-100 ${className}`}
      style={{ ...style }}
    >
      {/* Trigger Button with optional Input Group prefix icon */}
      <div className={prefixIcon ? "input-group input-group-sm w-100" : "w-100"}>
        {prefixIcon && (
          <span
            className="input-group-text bg-light text-secondary"
            style={{
              borderColor: isOpen ? '#86b7fe' : '#ced4da',
              width: '32px',
              justifyContent: 'center',
              fontSize: '12px',
              padding: 0,
              zIndex: 1,
            }}
          >
            <i className={prefixIcon}></i>
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            const next = !isOpen;
            setIsOpen(next);
            if (next) {
              setSearch('');
              setHighlightedIndex(0);
            }
          }}
          className={`form-select form-select-sm text-start d-flex align-items-center justify-content-between bg-white ${
            prefixIcon ? 'flex-grow-1' : 'w-100'
          }`}
          style={{
            minHeight: '33px',
            padding: '0.28rem 0.45rem',
            fontSize: '13px',
            borderColor: isOpen ? '#86b7fe' : '#ced4da',
            boxShadow: isOpen ? '0 0 0 0.2rem rgba(13, 110, 253, 0.15)' : 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            backgroundImage: 'none',
            borderTopLeftRadius: prefixIcon ? 0 : undefined,
            borderBottomLeftRadius: prefixIcon ? 0 : undefined,
          }}
          aria-expanded={isOpen}
        >
          <span className="text-truncate flex-grow-1 me-1">
            {selectedOption ? (
              renderTriggerLabel ? (
                renderTriggerLabel(selectedOption)
              ) : (
                <span className="d-inline-flex align-items-center gap-1.5 text-dark fw-normal text-truncate">
                  {selectedOption.icon && <i className={`${selectedOption.icon} text-secondary flex-shrink-0`}></i>}
                  <span className="text-truncate">{selectedOption.label}</span>
                  {selectedOption.badge && (
                    <span className="badge bg-light text-secondary border font-monospace ms-1 flex-shrink-0" style={{ fontSize: '10px' }}>
                      {selectedOption.badge}
                    </span>
                  )}
                </span>
              )
            ) : (
              <span className="text-muted">{placeholder}</span>
            )}
          </span>
          <div className="d-flex align-items-center flex-shrink-0 ms-1">
            {allowClear && value && !disabled && (
              <span
                role="button"
                className="p-1 text-muted me-1 d-inline-flex align-items-center justify-content-center"
                style={{ fontSize: '11px', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('');
                }}
                title="Xóa lựa chọn"
              >
                <i className="fas fa-times text-secondary"></i>
              </span>
            )}
            <i
              className="fas fa-chevron-down text-muted flex-shrink-0"
              style={{
                fontSize: '10px',
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            ></i>
          </div>
        </button>
      </div>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownMenuRef}
          className={`position-absolute bg-white border rounded-2 shadow-lg ${
            alignMenu === 'right' ? 'end-0' : 'start-0'
          }`}
          style={{
            ...(openUpwards
              ? { bottom: '100%', marginBottom: '4px' }
              : { top: '100%', marginTop: '4px' }),
            zIndex: 1085,
            minWidth: menuMinWidth ? (typeof menuMinWidth === 'number' ? `${menuMinWidth}px` : menuMinWidth) : '100%',
            width: 'max-content',
            maxWidth: 'min(500px, 92vw)',
            borderColor: '#cbd5e1',
            overscrollBehavior: 'contain',
            boxShadow: openUpwards
              ? '0 -10px 25px -5px rgba(0, 0, 0, 0.18), 0 -8px 10px -6px rgba(0, 0, 0, 0.1)'
              : '0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Top Search Input & Action */}
          <div className="p-2 border-bottom bg-light d-flex align-items-center gap-1.5">
            <div className="position-relative flex-grow-1">
              <i
                className="fas fa-search position-absolute top-50 start-0 translate-middle-y ms-2.5 text-muted"
                style={{ fontSize: '12px' }}
              ></i>
              <input
                ref={searchInputRef}
                type="text"
                className="form-control form-control-sm ps-4 pe-4"
                style={{ height: '32px', fontSize: '13px' }}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
                  } else if (e.key === 'Enter') {
                    if (filteredOptions.length > 0) {
                      e.preventDefault();
                      const target = filteredOptions[highlightedIndex] || filteredOptions[0];
                      if (target) handleSelect(target.value);
                    }
                  }
                }}
              />
              {search && (
                <button
                  type="button"
                  className="btn btn-link btn-sm position-absolute top-50 end-0 translate-middle-y me-1 p-0 text-muted"
                  style={{ textDecoration: 'none', fontSize: '12px' }}
                  onClick={() => setSearch('')}
                >
                  <i className="fas fa-times-circle"></i>
                </button>
              )}
            </div>
            {allowClear && value && (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm d-inline-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: '32px', height: '32px', padding: 0 }}
                onClick={() => handleSelect('')}
                title="Xóa lựa chọn (Để trống)"
                aria-label="Xóa lựa chọn"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          {/* Options List */}
          <div
            ref={optionsListRef}
            className="py-1"
            style={{
              maxHeight: `${Math.min(typeof maxHeight === 'number' ? maxHeight : 260, menuMaxHeight)}px`,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              scrollbarWidth: 'thin',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-muted small" style={{ fontSize: '13px' }}>
                <i className="fas fa-search me-1.5 opacity-50"></i>
                Không tìm thấy kết quả
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = highlightedIndex === idx && !isSelected;
                const level = opt.level || 0;
                const paddingLeft = level > 0 ? `${14 + level * 22}px` : '14px';

                return (
                  <div
                    key={opt.value}
                    className={`d-flex align-items-center justify-content-between px-3 py-2 transition-colors ${
                      isSelected
                        ? 'bg-primary text-white'
                        : isHighlighted
                        ? 'bg-light text-dark'
                        : 'text-dark'
                    }`}
                    style={{
                      cursor: 'pointer',
                      fontSize: '13px',
                      paddingLeft,
                      backgroundColor: isSelected ? '#0d6efd' : isHighlighted ? '#f1f5f9' : undefined,
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '';
                      }
                    }}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <div className="d-flex flex-column flex-grow-1 me-2 overflow-hidden">
                      <div className="d-flex align-items-center gap-1.5">
                        {level > 0 && (
                          <span
                            className={`me-1 ${isSelected ? 'text-white-50' : 'text-secondary opacity-50'}`}
                            style={{ fontSize: '12px', fontFamily: 'monospace', flexShrink: 0 }}
                          >
                            └─
                          </span>
                        )}
                        {opt.icon && (
                          <i
                            className={`${opt.icon} ${
                              isSelected ? 'text-white' : 'text-secondary'
                            }`}
                            style={{ fontSize: '12px', width: '16px', textAlign: 'center', flexShrink: 0 }}
                          ></i>
                        )}
                        <span
                          className={level === 0 ? 'fw-bold' : level === 1 ? 'fw-semibold' : 'fw-normal'}
                          style={{
                            color: isSelected ? '#ffffff' : (level === 0 ? '#0f172a' : '#1e293b'),
                            fontSize: level === 0 ? '13.5px' : '13px',
                            lineHeight: '1.35',
                          }}
                        >
                          {opt.label}
                        </span>
                      </div>
                      {opt.sublabel && (
                        <div
                          className={isSelected ? 'text-white-50' : 'text-muted'}
                          style={{
                            fontSize: '11.5px',
                            lineHeight: '1.3',
                            marginTop: '2px',
                            paddingLeft: level > 0 ? '24px' : (opt.icon ? '24px' : '0'),
                          }}
                        >
                          {opt.sublabel}
                        </div>
                      )}
                    </div>

                    <div className="d-flex align-items-center gap-1.5 flex-shrink-0 ms-2">
                      {opt.badge && (
                        <span
                          className={`badge ${
                            isSelected ? 'bg-white text-primary' : 'bg-light text-secondary border'
                          }`}
                          style={{ fontSize: '10.5px', fontWeight: 500, padding: '3px 6px' }}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <i className="fas fa-check text-white ms-1" style={{ fontSize: '12px' }}></i>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchableSelect;
