"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  recognizeMeterFromImage,
  MeterOcrResult,
  MeterCandidate,
} from "@/lib/ocr/meterOcr";

interface MeterOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc?: string | null;
  previousCounter?: number | null;
  equipmentModel?: string | null;
  onApplyCounter: (
    value: number,
    source: "OCR",
    details?: { confidence: number; rawText: string; candidateLabel?: string }
  ) => void;
}

export function MeterOcrModal({
  isOpen,
  onClose,
  imageSrc,
  previousCounter,
  equipmentModel,
  onApplyCounter,
}: MeterOcrModalProps) {
  const [currentImage, setCurrentImage] = useState<string | null>(imageSrc || null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [ocrResult, setOcrResult] = useState<MeterOcrResult | null>(null);
  const [selectedValue, setSelectedValue] = useState<number | "">("");
  const [selectedCandidate, setSelectedCandidate] = useState<MeterCandidate | null>(null);
  const [viewMode, setViewMode] = useState<"original" | "processed">("original");

  useEffect(() => {
    if (isOpen) {
      setCurrentImage(imageSrc || null);
      setOcrResult(null);
      setSelectedValue("");
      setSelectedCandidate(null);
      setProgress(0);
      setStatusText("");

      if (imageSrc) {
        // Tự động kích hoạt quét khi mở modal với ảnh có sẵn
        handleScan(imageSrc);
      }
    }
  }, [isOpen, imageSrc]);

  if (!isOpen) return null;

  const handleScan = async (imgSource: string | File) => {
    setScanning(true);
    setProgress(5);
    setStatusText("Đang chuẩn bị quét...");
    try {
      const res = await recognizeMeterFromImage(imgSource, {
        previousCounter: previousCounter ?? null,
        onProgress: (p, s) => {
          setProgress(p);
          setStatusText(s);
        },
      });

      setOcrResult(res);
      if (res.bestCandidate) {
        setSelectedValue(res.bestCandidate.value);
        setSelectedCandidate(res.bestCandidate);
        toast.success(`OCR nhận diện thành công: ${res.bestCandidate.formattedValue}`);
      } else {
        toast.warning("Không tìm thấy dãy số phù hợp trên ảnh. Bạn có thể nhập tay.");
      }
    } catch (err: any) {
      console.error("OCR scan error:", err);
      toast.error(err.message || "Lỗi khi quét nhận diện số từ hình ảnh");
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setCurrentImage(objectUrl);
    handleScan(file);
  };

  const handleSelectCandidate = (c: MeterCandidate) => {
    setSelectedValue(c.value);
    setSelectedCandidate(c);
  };

  const handleConfirmApply = () => {
    if (selectedValue === "" || isNaN(Number(selectedValue))) {
      toast.warning("Vui lòng chọn hoặc nhập số Counter hợp lệ");
      return;
    }
    const finalVal = Number(selectedValue);
    onApplyCounter(finalVal, "OCR", {
      confidence: selectedCandidate?.confidence ?? (ocrResult?.confidence || 85),
      rawText: ocrResult?.rawText || "",
      candidateLabel: selectedCandidate?.label,
    });
    onClose();
  };

  const delta =
    selectedValue !== "" && previousCounter != null
      ? Number(selectedValue) - previousCounter
      : null;

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", zIndex: 1060 }}
      tabIndex={-1}
      role="dialog"
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div className="modal-content shadow-lg border-0 rounded-3">
          {/* Header */}
          <div className="modal-header bg-dark text-white py-2 px-3">
            <h6 className="modal-title fw-bold d-flex align-items-center gap-2 mb-0">
              <i className="fas fa-magic text-warning"></i>
              <span>AI OCR - Quét số Counter từ ảnh đồng hồ</span>
            </h6>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={scanning}
            ></button>
          </div>

          {/* Body */}
          <div className="modal-body p-3">
            {/* Thanh thông tin máy & Counter cũ */}
            <div className="d-flex justify-content-between align-items-center bg-light p-2 rounded border mb-3 flex-wrap gap-2">
              <div>
                <span className="text-muted small">Thiết bị: </span>
                <strong className="text-dark">{equipmentModel || "Máy văn phòng"}</strong>
              </div>
              <div>
                <span className="text-muted small">Counter kỳ trước: </span>
                <span className="badge bg-secondary font-monospace fs-6">
                  {previousCounter != null
                    ? previousCounter.toLocaleString("vi-VN")
                    : "Chưa có"}
                </span>
              </div>
            </div>

            <div className="row g-3">
              {/* Cột trái: Hiển thị hình ảnh & Chụp/Tải mới */}
              <div className="col-md-6">
                <div className="border rounded p-2 bg-light text-center h-100 d-flex flex-column justify-content-between">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="small fw-semibold text-muted">
                      <i className="fas fa-image me-1"></i>Ảnh đồng hồ
                    </span>
                    {ocrResult?.processedImageUrl && (
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className={`btn btn-xs py-0 px-2 ${
                            viewMode === "original"
                              ? "btn-dark active"
                              : "btn-outline-secondary"
                          }`}
                          onClick={() => setViewMode("original")}
                        >
                          Gốc
                        </button>
                        <button
                          type="button"
                          className={`btn btn-xs py-0 px-2 ${
                            viewMode === "processed"
                              ? "btn-primary active"
                              : "btn-outline-secondary"
                          }`}
                          onClick={() => setViewMode("processed")}
                          title="Ảnh qua bộ lọc tương phản nhị phân cao"
                        >
                          Lọc nét (B&W)
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    className="position-relative d-flex align-items-center justify-content-center bg-dark rounded overflow-hidden"
                    style={{ minHeight: "220px", maxHeight: "300px" }}
                  >
                    {currentImage ? (
                      <img
                        src={
                          viewMode === "processed" && ocrResult?.processedImageUrl
                            ? ocrResult.processedImageUrl
                            : currentImage
                        }
                        alt="Ảnh đồng hồ Counter"
                        className="w-100 h-100 object-fit-contain"
                        style={{ maxHeight: "300px" }}
                      />
                    ) : (
                      <div className="text-white-50 p-4">
                        <i className="fas fa-camera fa-3x mb-2 d-block"></i>
                        <span>Chưa có ảnh. Vui lòng chọn ảnh để bắt đầu.</span>
                      </div>
                    )}

                    {scanning && (
                      <div
                        className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center"
                        style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                      >
                        <div className="spinner-border text-warning mb-2" role="status"></div>
                        <span className="text-white fw-semibold small">{statusText}</span>
                        <div
                          className="progress mt-2 w-75"
                          style={{ height: "6px" }}
                        >
                          <div
                            className="progress-bar progress-bar-striped progress-bar-animated bg-warning"
                            role="progressbar"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Nút chụp / chọn ảnh khác */}
                  <div className="mt-2 pt-2 border-top d-flex gap-2 justify-content-center">
                    <label className="btn btn-sm btn-outline-primary mb-0">
                      <i className="fas fa-folder-open me-1"></i>Chọn ảnh khác
                      <input
                        type="file"
                        accept="image/*"
                        className="d-none"
                        onChange={handleFileChange}
                        disabled={scanning}
                      />
                    </label>
                    {currentImage && !scanning && (
                      <button
                        type="button"
                        className="btn btn-sm btn-warning text-dark fw-semibold"
                        onClick={() => handleScan(currentImage)}
                      >
                        <i className="fas fa-sync-alt me-1"></i>Quét lại
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Cột phải: Kết quả nhận diện & Hiệu chỉnh */}
              <div className="col-md-6 d-flex flex-column justify-content-between">
                <div>
                  <h6 className="fw-bold text-dark mb-2 d-flex align-items-center justify-content-between">
                    <span>Kết quả AI nhận diện</span>
                    {ocrResult && (
                      <span className="badge bg-success-subtle text-success border border-success-subtle">
                        <i className="fas fa-clock me-1"></i>
                        {ocrResult.processingTimeMs} ms
                      </span>
                    )}
                  </h6>

                  {/* Số chính được chọn */}
                  <div className="p-3 border rounded-3 bg-primary-subtle border-primary mb-3">
                    <div className="text-muted small fw-semibold mb-1 d-flex justify-content-between">
                      <span>CHỈ SỐ COUNTER ĐỀ XUẤT:</span>
                      {selectedCandidate && (
                        <span
                          className={`badge ${
                            selectedCandidate.confidence >= 80
                              ? "bg-success"
                              : selectedCandidate.confidence >= 60
                              ? "bg-warning text-dark"
                              : "bg-secondary"
                          }`}
                        >
                          Độ tin cậy: {selectedCandidate.confidence}%
                        </span>
                      )}
                    </div>
                    <div className="input-group input-group-lg my-1">
                      <input
                        type="number"
                        className="form-control font-monospace fw-bold fs-3 text-primary text-center"
                        value={selectedValue}
                        onChange={(e) =>
                          setSelectedValue(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        placeholder="Nhập số..."
                        min={0}
                        disabled={scanning}
                      />
                    </div>
                    <div className="small text-muted text-center mt-1">
                      {selectedCandidate?.label && (
                        <span className="badge bg-white text-dark border me-1">
                          {selectedCandidate.label}
                        </span>
                      )}
                      <span>* Bạn có thể chỉnh sửa trực tiếp số ở trên nếu muốn.</span>
                    </div>

                    {/* So sánh với số cũ */}
                    {delta != null && (
                      <div className="mt-2 pt-2 border-top text-center">
                        {delta >= 0 ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle py-1 px-2">
                            <i className="fas fa-arrow-up me-1"></i>
                            Tăng +{delta.toLocaleString("vi-VN")} bản so với kỳ trước
                          </span>
                        ) : (
                          <span className="badge bg-warning text-dark py-1 px-2">
                            <i className="fas fa-exclamation-triangle me-1"></i>
                            Chỉ số giảm {(Math.abs(delta)).toLocaleString("vi-VN")} bản (Cần phê duyệt)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Danh sách các ứng viên số khác tìm thấy */}
                  {ocrResult && ocrResult.candidates.length > 1 && (
                    <div className="mb-2">
                      <div className="small fw-semibold text-muted mb-1.5">
                        <i className="fas fa-list-ol me-1"></i>Các số khác tìm thấy trên ảnh (Nhấp để chọn):
                      </div>
                      <div className="d-flex flex-wrap gap-1.5" style={{ maxHeight: "110px", overflowY: "auto" }}>
                        {ocrResult.candidates.map((cand) => {
                          const isPicked = cand.value === selectedValue;
                          return (
                            <button
                              key={cand.value}
                              type="button"
                              className={`btn btn-sm text-start font-monospace py-1 px-2 ${
                                isPicked
                                  ? "btn-primary active"
                                  : "btn-outline-secondary bg-white"
                              }`}
                              style={{ fontSize: "12px" }}
                              onClick={() => handleSelectCandidate(cand)}
                            >
                              <strong>{cand.formattedValue}</strong>
                              <span className="ms-1 opacity-75 small">
                                ({cand.confidence}%)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Văn bản thô OCR đọc được */}
                  {ocrResult?.rawText && (
                    <div className="mt-2">
                      <details className="small text-muted">
                        <summary className="cursor-pointer" style={{ cursor: "pointer" }}>
                          Xem văn bản thô AI trích xuất ({ocrResult.rawText.length} ký tự)
                        </summary>
                        <pre
                          className="bg-light p-2 rounded mt-1 border"
                          style={{ fontSize: "10.5px", maxHeight: "70px", overflowY: "auto" }}
                        >
                          {ocrResult.rawText}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="mt-3 pt-2 border-top d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={onClose}
                    disabled={scanning}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success fw-bold px-3 d-inline-flex align-items-center gap-1.5"
                    disabled={scanning || selectedValue === ""}
                    onClick={handleConfirmApply}
                  >
                    <i className="fas fa-check-circle"></i>
                    <span>Áp dụng chỉ số (OCR)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
