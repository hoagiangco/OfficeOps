"use client";

import { useEffect, useState } from "react";
import {
  getPendingActions,
  syncQueue,
  removeAction,
  OfflineAction,
} from "@/lib/offlineQueue";

export function OfflineSyncManager() {
  const [items, setItems] = useState<OfflineAction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const loadQueue = async () => {
    try {
      const list = await getPendingActions();
      setItems(list);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);
    loadQueue();

    const handleOnline = () => {
      setIsOnline(true);
      loadQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      loadQueue();
    };
    const handleQueueChange = () => {
      loadQueue();
    };
    const handleQueueSynced = () => {
      loadQueue();
      setSyncing(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("officeops:queue-changed", handleQueueChange);
    window.addEventListener("officeops:queue-synced", handleQueueSynced);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("officeops:queue-changed", handleQueueChange);
      window.removeEventListener("officeops:queue-synced", handleQueueSynced);
    };
  }, []);

  const handleSyncNow = async () => {
    if (!isOnline) {
      alert("Thiết bị đang ngoại tuyến. Vui lòng kết nối Internet/4G để đồng bộ.");
      return;
    }
    setSyncing(true);
    await syncQueue();
    setSyncing(false);
  };

  const handleRemove = async (id: string) => {
    if (confirm("Bạn có chắc muốn hủy tác vụ ngoại tuyến này?")) {
      await removeAction(id);
      loadQueue();
    }
  };

  if (items.length === 0) return null;

  return (
    <>
      {/* Floating Sync Pill */}
      <div
        className="position-fixed bottom-4 end-4 z-index-toast"
        style={{ zIndex: 1060, right: "16px", bottom: "80px" }}
      >
        <button
          onClick={() => setIsOpen(true)}
          className={`btn btn-sm rounded-pill shadow-lg d-flex align-items-center gap-2 fw-semibold px-3 py-2 border-0 ${
            isOnline ? "btn-warning text-dark" : "btn-dark text-warning border border-warning"
          }`}
        >
          <span className="spinner-grow spinner-grow-sm text-danger" role="status" style={{ width: 10, height: 10 }} />
          <span>
            {items.length} tác vụ chờ đồng bộ
          </span>
          <i className="fas fa-cloud-upload-alt ms-1"></i>
        </button>
      </div>

      {/* Modal / Sheet for Offline Queue Details */}
      {isOpen && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content rounded-4 border-0 shadow">
              <div className="modal-header bg-slate-900 text-white border-0 py-3">
                <div className="d-flex align-items-center gap-2">
                  <i className="fas fa-boxes text-warning"></i>
                  <h6 className="modal-title fw-bold mb-0">Hàng đợi Ngoại tuyến</h6>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setIsOpen(false)}
                />
              </div>

              <div className="modal-body p-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="small text-muted">
                    Trạng thái:{" "}
                    {isOnline ? (
                      <span className="text-success fw-bold">
                        <i className="fas fa-wifi me-1"></i> Trực tuyến (Online)
                      </span>
                    ) : (
                      <span className="text-danger fw-bold">
                        <i className="fas fa-plane me-1"></i> Ngoại tuyến (Offline)
                      </span>
                    )}
                  </span>
                  <span className="badge bg-secondary">{items.length} tác vụ</span>
                </div>

                <div className="d-flex flex-column gap-2" style={{ maxHeight: "280px", overflowY: "auto" }}>
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-3 border bg-light d-flex justify-content-between align-items-start gap-2"
                    >
                      <div className="small flex-grow-1">
                        <div className="fw-bold text-dark">{it.title}</div>
                        <div className="text-muted" style={{ fontSize: "11px" }}>
                          {new Date(it.createdAt).toLocaleTimeString("vi-VN")} •{" "}
                          <span
                            className={
                              it.status === "SYNCING"
                                ? "text-primary fw-bold"
                                : it.status === "FAILED"
                                ? "text-danger fw-bold"
                                : "text-secondary"
                            }
                          >
                            {it.status === "SYNCING"
                              ? "Đang gửi..."
                              : it.status === "FAILED"
                              ? `Lỗi (lần ${it.retryCount})`
                              : "Đang chờ"}
                          </span>
                        </div>
                        {it.lastError && (
                          <div className="text-danger mt-1" style={{ fontSize: "10px" }}>
                            {it.lastError}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-sm btn-outline-danger border-0 p-1"
                        title="Xóa bỏ"
                        onClick={() => handleRemove(it.id)}
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer bg-light border-0 p-3 d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary flex-1"
                  onClick={() => setIsOpen(false)}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary flex-1 d-flex align-items-center justify-center gap-2"
                  disabled={syncing || !isOnline}
                  onClick={handleSyncNow}
                >
                  {syncing ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      <span>Đang đồng bộ...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-sync-alt"></i>
                      <span>Đồng bộ ngay</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
