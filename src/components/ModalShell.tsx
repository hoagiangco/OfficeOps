'use client';

import React, { useState, useEffect } from 'react';

interface ModalShellProps {
  show?: boolean;
  open?: boolean;
  isOpen?: boolean;
  title: React.ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  headerClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean; // Mặc định false: không đóng khi bấm ra ngoài backdrop
  allowFullscreen?: boolean; // Cho phép phóng to mở rộng / thu nhỏ modal trên desktop
  scrollable?: boolean; // Cho phép cuộn bên trong modal-body (mặc định true)
  bodyClass?: string;
  bodyStyle?: React.CSSProperties;
  dialogStyle?: React.CSSProperties;
  dialogClass?: string;
  fullscreenOnMobile?: boolean; // Mặc định true: tự động 100% full-screen trên mobile / PWA (< 768px)
}

export function ModalShell({
  show,
  open,
  isOpen,
  title,
  onClose,
  size = 'md',
  headerClass = 'bg-primary text-white',
  children,
  footer,
  closeOnBackdrop = false,
  allowFullscreen = true,
  scrollable = true,
  bodyClass = 'p-3',
  bodyStyle,
  dialogStyle,
  dialogClass = '',
  fullscreenOnMobile = true,
}: ModalShellProps) {
  const isVisible = show ?? open ?? isOpen ?? false;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Phát hiện kích thước màn hình Mobile / PWA (< 768px)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767.98px)');
    const updateMatches = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    setIsMobile(mql.matches);
    mql.addEventListener?.('change', updateMatches);
    return () => mql.removeEventListener?.('change', updateMatches);
  }, []);

  // Tự động reset trạng thái toàn màn hình thủ công khi đóng modal
  useEffect(() => {
    if (!isVisible) {
      setIsFullscreen(false);
    }
  }, [isVisible]);

  // Khóa cuộn trang nền khi mở modal để tránh cuộn trang danh sách phía sau
  useEffect(() => {
    if (isVisible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isVisible]);

  // Xác định header sáng hay tối để render nút đóng / mở rộng tương ứng
  const isLightHeader =
    headerClass.includes('bg-white') ||
    headerClass.includes('bg-light') ||
    headerClass.includes('text-dark');

  if (!isVisible) return null;

  // Khi đang ở chế độ phóng to HOẶC đang mở trên màn hình Mobile/PWA
  const effectiveFullscreen = isFullscreen || (fullscreenOnMobile && isMobile);

  const sizeClass = effectiveFullscreen
    ? 'modal-fullscreen'
    : fullscreenOnMobile
    ? `modal-fullscreen-md-down ${
        size === 'sm'
          ? 'modal-sm'
          : size === 'lg'
          ? 'modal-lg'
          : size === 'xl' || size === 'xxl'
          ? 'modal-xl'
          : ''
      }`
    : size === 'sm'
    ? 'modal-sm'
    : size === 'lg'
    ? 'modal-lg'
    : size === 'xl' || size === 'xxl'
    ? 'modal-xl'
    : '';

  // Khi trên Mobile/PWA: Ép tràn viền 100vw x 100dvh, không bị inline maxWidth đè co hẹp
  const resolvedDialogStyle: React.CSSProperties = effectiveFullscreen
    ? { margin: 0, height: '100dvh', maxHeight: '100dvh', maxWidth: '100vw', width: '100vw' }
    : size === 'xxl'
    ? { maxWidth: 'min(1440px, 96vw)', width: '100%', ...dialogStyle }
    : size === 'xl'
    ? { maxWidth: 'min(1320px, 95vw)', width: '100%', ...dialogStyle }
    : { ...dialogStyle };

  return (
    <div
      className={`modal show d-block app-modal-backdrop ${effectiveFullscreen ? 'p-0' : ''}`}
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 1060 }}
      onClick={(e) => {
        // Chỉ đóng khi bấm ra ngoài nếu closeOnBackdrop = true
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`modal-dialog ${
          effectiveFullscreen ? 'modal-fullscreen' : 'modal-dialog-centered'
        } ${scrollable ? 'modal-dialog-scrollable' : ''} ${sizeClass} ${dialogClass} ${
          fullscreenOnMobile ? 'app-modal-mobile-fullscreen' : ''
        }`}
        style={resolvedDialogStyle}
      >
        <div
          className={`modal-content border-0 shadow-lg ${
            effectiveFullscreen ? 'rounded-0 h-100 d-flex flex-column' : 'rounded-3'
          }`}
          style={{
            ...(effectiveFullscreen ? { height: '100dvh', maxHeight: '100dvh', minHeight: '100dvh' } : {}),
            ...(!scrollable ? { overflowX: 'visible', overflowY: 'visible' } : {}),
          }}
        >
          {/* Header modal: Căn trái, căn đều trên dưới hoàn hảo */}
          <div
            className={`modal-header px-3 border-0 d-flex align-items-center justify-content-between flex-shrink-0 ${headerClass}`}
            style={{
              minHeight: '52px',
              paddingTop: effectiveFullscreen ? 'calc(0.75rem + env(safe-area-inset-top, 0px))' : '0.75rem',
              paddingBottom: '0.75rem',
              paddingLeft: effectiveFullscreen ? 'calc(1rem + env(safe-area-inset-left, 0px))' : '1rem',
              paddingRight: effectiveFullscreen ? 'calc(1rem + env(safe-area-inset-right, 0px))' : '1rem',
            }}
          >
            {/* Tiêu đề căn trái, căn đều trên dưới (vertically centered) */}
            <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1 my-auto">
              <h6 className="modal-title fw-bold mb-0 text-start text-truncate lh-base">
                {title}
              </h6>
            </div>

            {/* Cụm nút bên phải, căn giữa theo trục dọc */}
            <div className="d-flex align-items-center gap-2 flex-shrink-0 my-auto ms-2">
              {/* Nút phóng to / thu nhỏ chỉ hiển thị trên Desktop */}
              {allowFullscreen && !isMobile && (
                <button
                  type="button"
                  className={`btn btn-sm btn-link p-0 d-inline-flex align-items-center justify-content-center opacity-75 opacity-100-hover ${
                    isLightHeader ? 'text-secondary' : 'text-white'
                  }`}
                  style={{ width: '26px', height: '26px', textDecoration: 'none' }}
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  title={isFullscreen ? 'Thu nhỏ modal' : 'Mở rộng toàn màn hình'}
                >
                  <i
                    className={`fas ${
                      isFullscreen ? 'fa-compress-arrows-alt' : 'fa-expand-arrows-alt'
                    }`}
                    style={{ fontSize: '13px' }}
                  ></i>
                </button>
              )}
              <button
                type="button"
                className={`btn-close btn-close-sm my-auto ${
                  isLightHeader ? '' : 'btn-close-white'
                }`}
                onClick={onClose}
                aria-label="Đóng"
                style={{ padding: '0.45rem' }}
              ></button>
            </div>
          </div>

          {/* Body modal: Hỗ trợ cuộn mượt và overscroll-behavior contain */}
          <div
            className={`modal-body ${bodyClass}`}
            style={{
              overflowX: 'hidden',
              flex: '1 1 auto',
              overscrollBehavior: 'contain',
              ...(effectiveFullscreen
                ? {
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    paddingBottom: footer ? '1rem' : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
                    paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
                    paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
                  }
                : !scrollable
                ? { overflowX: 'visible', overflowY: 'visible' }
                : {}),
              ...bodyStyle,
            }}
          >
            {children}
          </div>

          {/* Footer modal: Dính cố định ở đáy và an toàn cho thanh gạt iPhone Home Bar */}
          {footer && (
            <div
              className="modal-footer py-2 px-3 bg-light border-top flex-shrink-0"
              style={
                effectiveFullscreen
                  ? {
                      paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                      paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
                      paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
                    }
                  : undefined
              }
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModalShell;
