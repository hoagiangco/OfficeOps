"use client";

import React, { useRef, useState, useEffect } from "react";

export function isValidSignatureDataUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  // Cho phép URL HTTP / HTTPS / Relative đường dẫn tĩnh
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
    return true;
  }
  // Kiểm tra định dạng data URL hình ảnh
  if (!url.startsWith("data:image/")) {
    return false;
  }
  // Chặn các chuỗi giả lập lỗi hoặc bị cắt dở chứa [DEMO_SIGNATURE] hoặc dấu ...
  if (url.includes("[") || url.includes("]") || url.includes("...") || url.includes(" ")) {
    return false;
  }
  const commaIdx = url.indexOf(",");
  if (commaIdx === -1) return false;
  const meta = url.slice(0, commaIdx);
  if (!meta.includes(";base64")) return false;
  const base64Data = url.slice(commaIdx + 1).trim();
  if (base64Data.length < 8) return false;
  return /^[A-Za-z0-9+/=]+$/.test(base64Data);
}

interface SignatureCanvasProps {
  value?: string | null;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

export function SignatureCanvas({ value, onChange, disabled }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Reset lỗi ảnh khi giá trị value thay đổi
  useEffect(() => {
    setImgError(false);
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#0d6efd";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return {
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const moveDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange("");
  };

  const isImageSignature = Boolean(
    value &&
    !imgError &&
    isValidSignatureDataUrl(value)
  );

  return (
    <div>
      {isImageSignature && !hasDrawn ? (
        <div className="border rounded bg-white p-2 text-center position-relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value || ""}
            alt="Chữ ký khách hàng"
            style={{ maxHeight: "90px", objectFit: "contain" }}
            onError={() => {
              setImgError(true);
              onChange("");
            }}
          />
          {!disabled && (
            <button
              type="button"
              className="btn btn-xs btn-outline-danger position-absolute top-0 end-0 m-1 py-0 px-2"
              onClick={() => {
                onChange("");
              }}
            >
              Ký lại
            </button>
          )}
        </div>
      ) : disabled && !value ? (
        <div className="border rounded bg-light p-3 text-center text-muted small fst-italic">
          <i className="fas fa-pen-nib text-secondary me-1"></i> Chưa có chữ ký khách hàng
        </div>
      ) : (
        <div className="position-relative border rounded bg-white">
          <canvas
            ref={canvasRef}
            width={340}
            height={90}
            className="w-100 d-block"
            style={{ touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair" }}
            onMouseDown={startDraw}
            onMouseMove={moveDraw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={moveDraw}
            onTouchEnd={endDraw}
          />
          {!hasDrawn && (
            <div
              className="position-absolute top-50 start-50 translate-middle text-muted small pointer-events-none"
              style={{ pointerEvents: "none", opacity: 0.5 }}
            >
              Ký tên trực tiếp tại đây (Chuột / Cảm ứng)
            </div>
          )}
          {hasDrawn && !disabled && (
            <button
              type="button"
              className="btn btn-xs btn-outline-secondary position-absolute top-0 end-0 m-1 py-0 px-2"
              style={{ fontSize: "11px" }}
              onClick={clearCanvas}
            >
              Xóa ký lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export default SignatureCanvas;
