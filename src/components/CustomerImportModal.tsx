"use client";

import React, { useState, useRef } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import {
  downloadCustomerTemplate,
  parseCustomerExcel,
  type CustomerImportRow,
} from "@/lib/customerExcel";

interface CustomerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  availableGroups?: string[];
}

export default function CustomerImportModal({
  isOpen,
  onClose,
  onSuccess,
  availableGroups,
}: CustomerImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [filterType, setFilterType] = useState<"ALL" | "NEW" | "DUPLICATE" | "ERROR">("ALL");
  const [duplicateAction, setDuplicateAction] = useState<"SKIP" | "UPDATE" | "CREATE_NEW">("SKIP");
  const [autoGenCode, setAutoGenCode] = useState(true);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [importing, setImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetState = () => {
    setFile(null);
    setRows([]);
    setFilterType("ALL");
    setDuplicateAction("SKIP");
    setImporting(false);
    setParsing(false);
    setCheckingDuplicates(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileProcess = async (selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      toast.error("Vui lòng chọn file định dạng Excel (.xlsx, .xls) hoặc .csv");
      return;
    }

    setParsing(true);
    setFile(selectedFile);
    try {
      const result = await parseCustomerExcel(selectedFile);
      let parsedRows = result.rows;

      if (parsedRows.length === 0) {
        toast.warning("File không có dữ liệu để nhập");
        setRows([]);
        return;
      }

      // Đối soát trùng lặp với CSDL thông qua API dry-run (checkOnly: true)
      const validRowsForCheck = parsedRows.filter((r) => r.isValid);
      if (validRowsForCheck.length > 0) {
        setCheckingDuplicates(true);
        try {
          const checkRes = await fetch("/api/customers/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: validRowsForCheck.map((r) => ({
                code: r.code || undefined,
                name: r.name,
                group: r.group,
                status: r.status,
                address: r.address,
                phone: r.phone || "",
                taxCode: r.taxCode || undefined,
                email: r.email || undefined,
                managerName: r.managerName || undefined,
                managerPhone: r.managerPhone || undefined,
                contactName: r.contactName || undefined,
                contactPhone: r.contactPhone || undefined,
                notes: r.notes || undefined,
              })),
              checkOnly: true,
            }),
          });

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.analysis && Array.isArray(checkData.analysis)) {
              let validIdx = 0;
              parsedRows = parsedRows.map((r) => {
                if (!r.isValid) return r;
                const an = checkData.analysis[validIdx++];
                if (an) {
                  return {
                    ...r,
                    isDuplicate: an.isDuplicate,
                    duplicateScope: an.duplicateScope,
                    duplicateReason: an.duplicateReason,
                    matchType: an.matchType,
                  };
                }
                return r;
              });
            }
          }
        } catch (checkErr) {
          console.warn("Không thể kiểm tra đối soát trùng lặp tự động:", checkErr);
        } finally {
          setCheckingDuplicates(false);
        }
      }

      setRows(parsedRows);

      const dupCount = parsedRows.filter((r) => r.isValid && r.isDuplicate).length;
      const newCount = parsedRows.filter((r) => r.isValid && !r.isDuplicate).length;

      if (dupCount > 0) {
        toast.warning(
          `Phát hiện ${dupCount} khách hàng trùng lặp và ${newCount} khách mới. Bạn có thể chọn cách xử lý (Bỏ qua hoặc Cập nhật).`
        );
      } else {
        toast.success(`Đã kiểm tra: Toàn bộ ${newCount} khách hàng đều mới và hợp lệ!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể đọc file Excel";
      toast.error(msg);
      setFile(null);
      setRows([]);
    } finally {
      setParsing(false);
      setCheckingDuplicates(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      handleFileProcess(f);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      handleFileProcess(f);
    }
  };

  const validRows = rows.filter((r) => r.isValid);
  const errorRows = rows.filter((r) => !r.isValid);
  const duplicateRows = validRows.filter((r) => r.isDuplicate);
  const newRows = validRows.filter((r) => !r.isDuplicate);

  const displayedRows =
    filterType === "NEW"
      ? newRows
      : filterType === "DUPLICATE"
      ? duplicateRows
      : filterType === "ERROR"
      ? errorRows
      : rows;

  // Tính số lượng bản ghi sẽ thực hiện tùy theo chế độ trùng lặp
  const targetCount =
    duplicateAction === "SKIP"
      ? newRows.length
      : duplicateAction === "UPDATE"
      ? newRows.length + duplicateRows.length
      : validRows.length;

  const handleImportSubmit = async () => {
    const candidates = skipInvalid ? validRows : rows;

    if (candidates.length === 0) {
      toast.warning("Không có dòng dữ liệu hợp lệ nào để nhập");
      return;
    }

    if (!skipInvalid && errorRows.length > 0) {
      toast.error("Vui lòng khắc phục các dòng bị lỗi hoặc bật tùy chọn 'Bỏ qua dòng lỗi'");
      return;
    }

    setImporting(true);
    try {
      const payload = {
        items: candidates.map((r) => ({
          code: r.code || undefined,
          name: r.name,
          group: r.group,
          status: r.status,
          address: r.address,
          phone: r.phone || "",
          taxCode: r.taxCode || undefined,
          email: r.email || undefined,
          managerName: r.managerName || undefined,
          managerPhone: r.managerPhone || undefined,
          contactName: r.contactName || undefined,
          contactPhone: r.contactPhone || undefined,
          notes: r.notes || undefined,
        })),
        duplicateAction,
        autoGenerateCodeOnConflict: autoGenCode,
        checkOnly: false,
      };

      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Có lỗi xảy ra khi nhập danh sách khách hàng");
        return;
      }

      const msgParts: string[] = [];
      if (data.importedCount > 0) {
        msgParts.push(`Tạo mới: ${data.importedCount} khách`);
      }
      if (data.updatedCount > 0) {
        msgParts.push(`Cập nhật: ${data.updatedCount} khách`);
      }
      if (data.skippedCount > 0) {
        msgParts.push(`Bỏ qua: ${data.skippedCount} khách trùng`);
      }

      toast.success(msgParts.join(" • ") || "Hoàn tất xử lý dữ liệu");

      if (data.failedCount > 0) {
        toast.warning(`Có ${data.failedCount} dòng gặp lỗi không thể xử lý.`);
      }

      handleClose();
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi hệ thống khi gửi dữ liệu";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-file-excel text-success fs-5"></i>
          <span>Nhập danh sách khách hàng từ file mẫu Excel</span>
        </div>
      }
      size="xl"
      headerClass="bg-dark text-white"
    >
      <div className="d-flex flex-column gap-3">
        {/* Bước 1: Tải file mẫu & Hướng dẫn */}
        <div className="bg-light border rounded p-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <div className="fw-bold text-primary mb-1">
                <i className="fas fa-info-circle me-1"></i> Bước 1: Chuẩn bị dữ liệu theo file mẫu
              </div>
              <div className="small text-muted">
                Tải file mẫu Excel chuẩn có sẵn cột và dữ liệu minh họa. Cột{" "}
                <span className="text-danger fw-bold">Tên khách hàng</span> và{" "}
                <span className="text-danger fw-bold">Địa chỉ chính</span> là bắt buộc. Cột{" "}
                <span className="text-success fw-bold">Số điện thoại không bắt buộc</span> (có thể để trống).
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline-success btn-sm fw-bold px-3 d-inline-flex align-items-center gap-1 shadow-sm"
              onClick={() => downloadCustomerTemplate(availableGroups)}
            >
              <i className="fas fa-download"></i>
              Tải file mẫu Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Bước 2: Tải file lên */}
        <div>
          <div className="fw-bold mb-2 small text-uppercase text-secondary">
            <i className="fas fa-cloud-upload-alt me-1"></i> Bước 2: Chọn hoặc kéo thả file Excel cần nhập
          </div>

          <div
            className={`border rounded-3 p-4 text-center transition-all ${
              isDragOver ? "border-primary bg-primary bg-opacity-10" : "bg-white border-2 border-dashed"
            }`}
            style={{ borderStyle: "dashed", cursor: "pointer" }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              className="d-none"
              onChange={handleFileInputChange}
            />

            {parsing || checkingDuplicates ? (
              <div className="py-2 text-primary">
                <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                {parsing ? "Đang đọc dữ liệu file Excel..." : "Đang đối soát kiểm tra khách hàng trùng lặp..."}
              </div>
            ) : file ? (
              <div className="d-flex align-items-center justify-content-center gap-3">
                <i className="fas fa-file-excel text-success fs-1"></i>
                <div className="text-start">
                  <div className="fw-bold text-dark">{file.name}</div>
                  <div className="small text-muted">
                    {(file.size / 1024).toFixed(1)} KB • Nhấn để chọn lại file khác
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary ms-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetState();
                  }}
                >
                  <i className="fas fa-times me-1"></i> Xóa file
                </button>
              </div>
            ) : (
              <div>
                <i className="fas fa-file-excel text-muted fs-1 mb-2"></i>
                <div className="fw-semibold text-secondary">
                  Kéo thả file Excel vào đây hoặc <span className="text-primary text-decoration-underline">nhấn để duyệt file</span>
                </div>
                <div className="text-muted small mt-1">Hỗ trợ các định dạng: .xlsx, .xls, .csv</div>
              </div>
            )}
          </div>
        </div>

        {/* Bước 3: Xem trước kết quả & Thống kê */}
        {rows.length > 0 && (
          <div>
            {/* Thanh công cụ lọc dữ liệu */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <div className="d-flex align-items-center gap-2">
                <span className="small fw-bold text-uppercase text-secondary">
                  <i className="fas fa-table me-1"></i> Bước 3: Xem trước ({rows.length} dòng)
                </span>
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    className={`btn btn-sm ${filterType === "ALL" ? "btn-dark" : "btn-outline-dark"}`}
                    onClick={() => setFilterType("ALL")}
                  >
                    Tất cả ({rows.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${filterType === "NEW" ? "btn-success" : "btn-outline-success"}`}
                    onClick={() => setFilterType("NEW")}
                  >
                    <i className="fas fa-plus-circle me-1"></i> Mới ({newRows.length})
                  </button>
                  {duplicateRows.length > 0 && (
                    <button
                      type="button"
                      className={`btn btn-sm ${filterType === "DUPLICATE" ? "btn-warning" : "btn-outline-warning text-dark"}`}
                      onClick={() => setFilterType("DUPLICATE")}
                    >
                      <i className="fas fa-copy me-1"></i> Trùng lặp ({duplicateRows.length})
                    </button>
                  )}
                  {errorRows.length > 0 && (
                    <button
                      type="button"
                      className={`btn btn-sm ${filterType === "ERROR" ? "btn-danger" : "btn-outline-danger"}`}
                      onClick={() => setFilterType("ERROR")}
                    >
                      <i className="fas fa-exclamation-triangle me-1"></i> Có lỗi ({errorRows.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Tùy chọn sinh mã */}
              <div className="d-flex align-items-center gap-3">
                <div className="form-check form-check-inline form-switch small mb-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="autoGenCodeCheck"
                    checked={autoGenCode}
                    onChange={(e) => setAutoGenCode(e.target.checked)}
                  />
                  <label className="form-check-label text-secondary" htmlFor="autoGenCodeCheck">
                    Tự sinh mã nếu trùng/để trống
                  </label>
                </div>
                {errorRows.length > 0 && (
                  <div className="form-check form-check-inline form-switch small mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="skipInvalidCheck"
                      checked={skipInvalid}
                      onChange={(e) => setSkipInvalid(e.target.checked)}
                    />
                    <label className="form-check-label text-secondary" htmlFor="skipInvalidCheck">
                      Bỏ qua dòng lỗi ({errorRows.length})
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* BẢNG ĐIỀU KHIỂN XỬ LÝ TRÙNG LẶP NẾU PHÁT HIỆN */}
            {duplicateRows.length > 0 && (
              <div className="alert alert-warning py-2 px-3 mb-2 small border-warning rounded">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <i className="fas fa-shield-alt fs-5 text-warning"></i>
                    <div>
                      <strong>Cơ chế phát hiện trùng:</strong> Phát hiện <strong>{duplicateRows.length} khách hàng</strong> bị trùng (Mã số thuế, Mã KH, Tên hoặc SĐT).
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <span className="fw-bold text-dark">Khi gặp khách trùng:</span>
                    <div className="form-check form-check-inline mb-0">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="dupAction"
                        id="dupSkip"
                        value="SKIP"
                        checked={duplicateAction === "SKIP"}
                        onChange={() => setDuplicateAction("SKIP")}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="dupSkip" title="Giữ nguyên khách cũ trong hệ thống, chỉ thêm khách mới">
                        🛡️ Bỏ qua (Chỉ tạo khách mới)
                      </label>
                    </div>
                    <div className="form-check form-check-inline mb-0">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="dupAction"
                        id="dupUpdate"
                        value="UPDATE"
                        checked={duplicateAction === "UPDATE"}
                        onChange={() => setDuplicateAction("UPDATE")}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="dupUpdate" title="Cập nhật địa chỉ, SĐT, người liên hệ mới từ file Excel vào khách cũ">
                        🔄 Cập nhật thông tin khách cũ
                      </label>
                    </div>
                    <div className="form-check form-check-inline mb-0">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="dupAction"
                        id="dupCreate"
                        value="CREATE_NEW"
                        checked={duplicateAction === "CREATE_NEW"}
                        onChange={() => setDuplicateAction("CREATE_NEW")}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="dupCreate" title="Vẫn tạo mới và tự động sinh mã quản lý riêng">
                        ➕ Vẫn tạo mới
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bảng xem trước dữ liệu */}
            <div
              className="table-responsive border rounded bg-white shadow-sm"
              style={{ maxHeight: "300px", overflowY: "auto" }}
            >
              <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: "12.5px" }}>
                <thead className="table-light sticky-top" style={{ zIndex: 1 }}>
                  <tr>
                    <th style={{ width: "45px" }} className="text-center">#</th>
                    <th style={{ width: "160px" }}>Đánh giá dữ liệu</th>
                    <th style={{ width: "110px" }}>Mã KH</th>
                    <th>Tên khách hàng / DN</th>
                    <th style={{ width: "130px" }}>Phân nhóm</th>
                    <th style={{ width: "100px" }}>Trạng thái</th>
                    <th>Địa chỉ chính</th>
                    <th style={{ width: "120px" }}>Số điện thoại</th>
                    <th style={{ width: "120px" }}>Mã số thuế</th>
                    <th>Người liên hệ</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        !r.isValid
                          ? "table-danger bg-opacity-25"
                          : r.isDuplicate
                          ? "table-warning bg-opacity-25"
                          : ""
                      }
                    >
                      <td className="text-center text-muted small">{i + 1}</td>
                      <td>
                        {!r.isValid ? (
                          <span
                            className="badge bg-danger-subtle text-danger border border-danger-subtle d-inline-flex align-items-center gap-1"
                            title={r.errors.join(", ")}
                          >
                            <i className="fas fa-times-circle"></i> {r.errors[0]}
                          </span>
                        ) : r.isDuplicate ? (
                          <span
                            className="badge bg-warning text-dark border border-warning d-inline-flex align-items-center gap-1"
                            title={r.duplicateReason}
                            style={{ cursor: "help" }}
                          >
                            <i className="fas fa-copy"></i>
                            {r.matchType === "taxCode"
                              ? "Trùng MST"
                              : r.matchType === "code"
                              ? "Trùng Mã"
                              : r.matchType === "name"
                              ? "Trùng Tên"
                              : "Trùng SĐT"}
                          </span>
                        ) : (
                          <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1">
                            <i className="fas fa-check"></i> Hợp lệ (Mới)
                          </span>
                        )}
                      </td>
                      <td className="font-monospace text-muted">
                        {r.code ? (
                          <span className="fw-semibold text-dark">{r.code}</span>
                        ) : (
                          <span className="fst-italic text-secondary" style={{ fontSize: "11px" }}>
                            (Tự sinh)
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="fw-semibold text-dark">{r.name}</div>
                        {r.isDuplicate && r.duplicateReason && (
                          <div className="text-muted small fst-italic" style={{ fontSize: "11px" }}>
                            <i className="fas fa-info-circle me-1 text-warning"></i>
                            {r.duplicateReason}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border">{r.group}</span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.status === "ACTIVE"
                              ? "bg-success"
                              : r.status === "SUSPENDED"
                              ? "bg-warning text-dark"
                              : "bg-secondary"
                          }`}
                        >
                          {r.status === "ACTIVE"
                            ? "Đang dùng"
                            : r.status === "SUSPENDED"
                            ? "Tạm ngưng"
                            : "Ngừng DV"}
                        </span>
                      </td>
                      <td className="text-truncate" style={{ maxWidth: "200px" }} title={r.address}>
                        {r.address}
                      </td>
                      <td className="font-monospace">
                        {r.phone ? (
                          <span>{r.phone}</span>
                        ) : (
                          <span className="text-muted fst-italic" style={{ fontSize: "11px" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="font-monospace text-muted small">{r.taxCode || "—"}</td>
                      <td className="small">
                        {r.contactName ? (
                          <span>
                            {r.contactName} {r.contactPhone ? `(${r.contactPhone})` : ""}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {errorRows.length > 0 && !skipInvalid && (
              <div className="alert alert-danger py-2 px-3 small mt-2 mb-0 d-flex align-items-center gap-2">
                <i className="fas fa-exclamation-triangle fs-6"></i>
                <span>
                  Phát hiện <strong>{errorRows.length} dòng bị lỗi</strong>. Vui lòng tick chọn{" "}
                  <strong>&quot;Bỏ qua dòng lỗi&quot;</strong> để chỉ nhập các dòng hợp lệ hoặc cập nhật lại file Excel.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Chân Modal: Nút hành động */}
        <div className="d-flex justify-content-between align-items-center pt-2 border-top">
          <div className="small text-muted">
            {rows.length > 0 && (
              <div>
                <span>
                  Tổng số: <strong>{rows.length}</strong> dòng • Mới:{" "}
                  <strong className="text-success">{newRows.length}</strong>
                  {duplicateRows.length > 0 && (
                    <>
                      {" "}• Trùng: <strong className="text-warning">{duplicateRows.length}</strong>
                    </>
                  )}
                  {errorRows.length > 0 && (
                    <>
                      {" "}• Lỗi: <strong className="text-danger">{errorRows.length}</strong>
                    </>
                  )}
                </span>
                <div className="text-secondary mt-1">
                  Kế hoạch:{" "}
                  {duplicateAction === "SKIP" ? (
                    <span>
                      Tạo mới <strong className="text-success">{newRows.length}</strong> khách • Bỏ qua{" "}
                      <strong>{duplicateRows.length}</strong> khách trùng
                    </span>
                  ) : duplicateAction === "UPDATE" ? (
                    <span>
                      Tạo mới <strong className="text-success">{newRows.length}</strong> khách • Cập nhật{" "}
                      <strong className="text-primary">{duplicateRows.length}</strong> khách cũ
                    </span>
                  ) : (
                    <span>
                      Tạo mới tất cả <strong className="text-success">{validRows.length}</strong> khách hàng
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm px-3"
              onClick={handleClose}
              disabled={importing}
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm px-4 fw-bold shadow-sm d-inline-flex align-items-center gap-2"
              onClick={handleImportSubmit}
              disabled={importing || targetCount === 0 || (!skipInvalid && errorRows.length > 0)}
            >
              {importing ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status"></span>
                  Đang xử lý nhập...
                </>
              ) : (
                <>
                  <i className="fas fa-file-import"></i>
                  Xác nhận thực hiện ({targetCount})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
