"use client";

import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: "" };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo: errorInfo.componentStack || "" });
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#f8f9fa",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              width: "100%",
              background: "#fff",
              borderRadius: "12px",
              padding: "32px 24px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "16px" }}>⚠️</div>
            <h5 style={{ color: "#dc3545", marginBottom: "8px", fontWeight: 700 }}>
              Đã xảy ra sự cố hiển thị
            </h5>
            <p style={{ color: "#6c757d", marginBottom: "16px", fontSize: "0.9rem" }}>
              Thành phần gặp lỗi không mong muốn. Vui lòng tải lại hoặc liên hệ quản trị viên.
            </p>
            {this.state.error && (
              <details style={{ marginBottom: "20px", textAlign: "left" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    color: "#6c757d",
                    fontSize: "0.8rem",
                    marginBottom: "8px",
                  }}
                >
                  Xem chi tiết lỗi kỹ thuật
                </summary>
                <pre
                  style={{
                    background: "#f8f9fa",
                    padding: "12px",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    color: "#dc3545",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: "180px",
                    overflowY: "auto",
                  }}
                >
                  {this.state.error.message}
                  {this.state.errorInfo && "\n\n" + this.state.errorInfo}
                </pre>
              </details>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn btn-primary btn-sm px-3"
              >
                <i className="fas fa-sync-alt me-1"></i> Tải lại trang
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="btn btn-outline-secondary btn-sm px-3"
              >
                <i className="fas fa-home me-1"></i> Về trang chủ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
