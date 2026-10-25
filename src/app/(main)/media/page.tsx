"use client";

import React from "react";
import FileManager from "@/components/FileManager";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function MediaLibraryPage() {
  return (
    <div className="py-2 h-100 d-flex flex-column" style={{ minHeight: "calc(100vh - 100px)" }}>
      {/* Header trang */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-1 text-dark fw-bold">
            <i className="fas fa-photo-video text-primary me-2"></i>Thư viện Media & Tập tin
          </h4>
          <p className="text-muted mb-0 small">
            Quản lý tập trung hình ảnh tài sản, máy photocopy, linh kiện và tài liệu kỹ thuật.
            <span className="ms-1">
              <strong>Mẹo:</strong> Kéo thả file vào trang hoặc nhấn <kbd className="bg-secondary text-white px-1 rounded">Ctrl</kbd> + <kbd className="bg-secondary text-white px-1 rounded">V</kbd> để dán ảnh tức thì từ Clipboard!
            </span>
          </p>
        </div>
      </div>

      {/* Khung quản lý Media */}
      <div className="flex-grow-1 rounded-3 shadow-sm border overflow-hidden bg-white">
        <ErrorBoundary>
          <FileManager
            isOpen={true}
            embedded={true}
            mode="all"
            multiSelect={true}
            onClose={() => {}}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
