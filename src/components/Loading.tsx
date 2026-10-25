'use client';

import React from 'react';

export const Loading = ({
  fullPage = false,
  message,
  text,
}: {
  fullPage?: boolean;
  message?: string;
  text?: string;
  size?: string;
}) => {
  const displayMsg = message || text || 'Đang tải dữ liệu...';
  const content = (
    <div className="d-flex flex-column align-items-center justify-content-center py-5">
      <div className="mb-3 d-flex align-items-center justify-content-center">
        <div
          className="bg-white rounded-circle d-flex align-items-center justify-content-center border shadow-sm"
          style={{ width: '56px', height: '56px', fontSize: '1.75rem' }}
        >
          <i className="fas fa-sync-alt fa-spin text-primary"></i>
        </div>
      </div>
      <p className="text-muted fw-medium mb-0" style={{ fontSize: '0.95rem' }}>{displayMsg}</p>
    </div>
  );

  if (fullPage) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        {content}
      </div>
    );
  }

  return content;
};

export default Loading;
