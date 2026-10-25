"use client";

import React, { useState, useEffect } from "react";
import { ModalShell } from "@/components/ModalShell";
import { toast } from "react-toastify";

interface ZaloTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ZaloStatus {
  isConfigured: boolean;
  mode: string;
  zaloAppId: string;
  zaloOaId: string;
  hasAccessToken: boolean;
}

export function ZaloTestModal({ isOpen, onClose }: ZaloTestModalProps) {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [status, setStatus] = useState<ZaloStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("Kiểm tra kết nối Zalo Notification Service từ OfficeOps");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; simulated?: boolean } | null>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/zalo-test");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        toast.error("Không thể kiểm tra trạng thái Zalo OA");
      }
    } catch {
      toast.error("Lỗi kết nối kiểm tra Zalo OA");
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    if (!phone.trim()) {
      toast.warning("Vui lòng nhập số điện thoại nhận tin");
      return;
    }

    setSending(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/admin/zalo-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const msg = data.simulated
          ? "Đã gửi thông báo ZNS giả lập thành công (Chế độ mô phỏng an toàn, đã ghi vào DB)!"
          : "Đã gửi thông báo Zalo ZNS thật thành công đến điện thoại!";
        setTestResult({ ok: true, msg, simulated: data.simulated });
        toast.success(msg);
      } else {
        const errMsg = data.error || "Gửi tin nhắn ZNS thất bại";
        setTestResult({ ok: false, msg: errMsg });
        toast.error(errMsg);
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message || "Lỗi mạng khi gọi Zalo API" });
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-comment-dots text-info"></i>
          <span className="fw-bold text-dark">Kiểm Tra Dịch Vụ Zalo OA & ZNS</span>
        </div>
      }
      size="md"
      headerClass="bg-light border-bottom"
    >
      <div className="py-2">
        {/* Card trạng thái cấu hình */}
        <div className="p-3 bg-light border rounded-3 mb-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span className="small fw-bold text-dark">
              <i className="fas fa-server me-1.5 text-secondary"></i>
              Trạng thái kết nối Zalo OA:
            </span>
            <button
              type="button"
              className="btn btn-xs btn-outline-secondary py-0 px-2"
              onClick={fetchStatus}
              disabled={loadingStatus}
            >
              <i className={`fas fa-sync-alt ${loadingStatus ? "fa-spin" : ""}`}></i>
            </button>
          </div>

          {loadingStatus ? (
            <div className="text-center py-2 text-muted small">
              <div className="spinner-border spinner-border-sm me-1"></div> Đang kiểm tra...
            </div>
          ) : status ? (
            <div className="small">
              <div className="d-flex justify-content-between mb-1">
                <span className="text-muted">Chế độ vận hành:</span>
                <span
                  className={`badge ${
                    status.hasAccessToken
                      ? "bg-success"
                      : "bg-warning text-dark"
                  }`}
                >
                  {status.mode}
                </span>
              </div>
              <div className="d-flex justify-content-between mb-1">
                <span className="text-muted">Zalo App ID:</span>
                <span className="font-monospace fw-bold">{status.zaloAppId}</span>
              </div>
              <div className="d-flex justify-content-between mb-1">
                <span className="text-muted">Zalo OA ID:</span>
                <span className="font-monospace fw-bold">{status.zaloOaId}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted">Access Token:</span>
                <span className={status.hasAccessToken ? "text-success fw-bold" : "text-muted"}>
                  {status.hasAccessToken ? "Đã sẵn sàng" : "Chưa có (Chạy mô phỏng an toàn)"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-muted small">Chưa nạp được trạng thái</div>
          )}
        </div>

        {/* Form gửi thử nghiệm */}
        <form onSubmit={handleSendTest}>
          <div className="mb-2">
            <label className="form-label small fw-bold mb-1">
              Số điện thoại nhận tin ZNS (*):
            </label>
            <input
              type="tel"
              className="form-control form-control-sm font-monospace"
              required
              placeholder="VD: 0908123456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold mb-1">Nội dung tin nhắn thử nghiệm:</label>
            <input
              type="text"
              className="form-control form-control-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {testResult && (
            <div
              className={`alert ${
                testResult.ok ? "alert-success" : "alert-danger"
              } py-2 px-3 small mb-3`}
            >
              <i
                className={`fas ${
                  testResult.ok ? "fa-check-circle" : "fa-exclamation-triangle"
                } me-1.5`}
              ></i>
              <span>{testResult.msg}</span>
            </div>
          )}

          <div className="d-flex justify-content-end gap-2 pt-2 border-top">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={onClose}
              disabled={sending}
            >
              Đóng
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-info text-dark fw-bold d-inline-flex align-items-center gap-1.5"
              disabled={sending}
            >
              <i className={`fas ${sending ? "fa-spinner fa-spin" : "fa-paper-plane"}`}></i>
              <span>{sending ? "Đang gửi..." : "Gửi tin thử nghiệm"}</span>
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
