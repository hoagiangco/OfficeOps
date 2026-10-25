"use client";

import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface CameraQRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // ignore audio restriction
  }
}

export function CameraQRScanner({ isOpen, onClose, onScan }: CameraQRScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = "qr-reader-container";

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setErrorMsg(null);

    const startScanner = async () => {
      try {
        // Đợi DOM render element
        await new Promise((r) => setTimeout(r, 200));
        if (!isMounted) return;

        const html5QrCode = new Html5Qrcode(readerElementId);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            playBeep();
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate([100, 50, 100]);
            }
            // Dừng scanner và trả kết quả
            html5QrCode
              .stop()
              .then(() => {
                onScan(decodedText);
              })
              .catch(() => {
                onScan(decodedText);
              });
          },
          () => {
            // Không quét thấy trong frame này - bỏ qua
          }
        );

        if (isMounted) setCameraActive(true);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Permission") || msg.includes("NotAllowedError")) {
          setErrorMsg("Trình duyệt chưa được cấp quyền truy cập Camera. Vui lòng cho phép quyền Camera để quét mã.");
        } else if (msg.includes("NotFoundError") || msg.includes("Requested device not found")) {
          setErrorMsg("Không tìm thấy Camera trên thiết bị này. Bạn có thể nhập mã tay bên dưới.");
        } else {
          setErrorMsg("Không thể khởi động Camera. Bạn có thể nhập mã tay bên dưới.");
        }
        setCameraActive(false);
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
          scannerRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
        scannerRef.current = null;
      }
      setCameraActive(false);
    };
  }, [isOpen, onScan]);

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerElementId);
      }
      const decodedText = await scannerRef.current.scanFile(file, true);
      playBeep();
      onScan(decodedText);
    } catch {
      alert("Không tìm thấy mã QR trong hình ảnh đã chọn. Vui lòng thử ảnh khác.");
    } finally {
      e.target.value = "";
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    onScan(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)", zIndex: 1060 }}
    >
      <div className="modal-dialog modal-dialog-centered modal-fullscreen-sm-down" style={{ maxWidth: "440px" }}>
        <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-dark text-white">
          {/* Header: Căn trái, căn đều trên dưới */}
          <div
            className="modal-header px-3 border-secondary border-opacity-25 bg-black bg-opacity-40 d-flex align-items-center justify-content-between"
            style={{ minHeight: "52px", paddingTop: "0.75rem", paddingBottom: "0.75rem" }}
          >
            <div className="d-flex align-items-center gap-2 flex-grow-1 text-truncate my-auto">
              <div
                className="bg-warning text-dark rounded-circle d-flex align-items-center justify-content-center shadow-sm flex-shrink-0"
                style={{ width: "26px", height: "26px" }}
              >
                <i className="fas fa-qrcode fa-sm"></i>
              </div>
              <h6 className="modal-title fw-bold text-white mb-0 text-truncate">Quét Mã QR / Barcode Máy</h6>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white ms-2 flex-shrink-0 my-auto"
              onClick={onClose}
              aria-label="Close"
            ></button>
          </div>

          {/* Body */}
          <div className="modal-body p-3 text-center">
            {/* Viewfinder Camera Box */}
            <div
              className="position-relative mx-auto rounded-3 overflow-hidden bg-black border border-secondary border-opacity-50 shadow-inner"
              style={{
                width: "100%",
                maxWidth: "320px",
                height: "280px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Vùng html5-qrcode gắn video stream */}
              <div
                id={readerElementId}
                style={{
                  width: "100%",
                  height: "100%",
                }}
              ></div>

              {/* Lớp phủ hiệu ứng ngắm QR (Viewfinder Overlay) khi Camera đang chạy */}
              {cameraActive && (
                <div
                  className="position-absolute pointer-events-none"
                  style={{
                    width: "200px",
                    height: "200px",
                    border: "2px solid rgba(25, 135, 84, 0.9)",
                    borderRadius: "16px",
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
                  }}
                >
                  {/* Tia laser quét lên xuống */}
                  <div
                    style={{
                      height: "2px",
                      background: "linear-gradient(90deg, transparent, #20c997, transparent)",
                      boxShadow: "0 0 8px #20c997",
                      animation: "qrScanLaser 2s infinite ease-in-out",
                    }}
                  ></div>
                </div>
              )}

              {/* Thông báo lỗi hoặc đang tải */}
              {!cameraActive && !errorMsg && (
                <div className="position-absolute text-muted small p-3">
                  <div className="spinner-border spinner-border-sm text-warning mb-2" role="status"></div>
                  <div>Đang khởi động Camera...</div>
                </div>
              )}

              {errorMsg && (
                <div className="position-absolute text-warning small p-3 bg-dark bg-opacity-75 rounded m-2">
                  <i className="fas fa-exclamation-triangle fa-2x mb-2 text-warning d-block"></i>
                  <div style={{ fontSize: "12px" }}>{errorMsg}</div>
                </div>
              )}
            </div>

            <div className="text-secondary small mt-2 mb-3" style={{ fontSize: "12px" }}>
              Hướng Camera vào tem mã QR hoặc Barcode dán trên thân máy
            </div>

            {/* Các tùy chọn phụ: Quét từ ảnh trong máy */}
            <div className="d-flex justify-content-center gap-2 mb-3">
              <label className="btn btn-outline-light btn-sm px-3 rounded-pill" style={{ fontSize: "12px" }}>
                <i className="fas fa-image me-1 text-info"></i> Quét từ ảnh có sẵn
                <input
                  type="file"
                  accept="image/*"
                  className="d-none"
                  onChange={handleScanImageFile}
                />
              </label>
            </div>

            {/* Nhập mã thủ công (Fallback) */}
            <form onSubmit={handleManualSubmit} className="border-top border-secondary border-opacity-25 pt-2">
              <div className="small text-start text-secondary mb-1">Hoặc nhập mã Serial / QR thủ công:</div>
              <div className="input-group input-group-sm">
                <input
                  type="text"
                  className="form-control bg-secondary bg-opacity-25 border-secondary text-white font-monospace"
                  placeholder="VD: HP-M404DN-7712..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                />
                <button type="submit" className="btn btn-warning fw-bold px-3">
                  Tra cứu
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="modal-footer py-2 px-3 border-secondary border-opacity-25 bg-black bg-opacity-40">
            <button type="button" className="btn btn-secondary btn-sm w-100" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes qrScanLaser {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(196px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        #qr-reader-container video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
