"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "react-toastify";
import { compressImage } from "@/lib/imageCompression";
import { formatDateDisplay } from "@/lib/dateFormat";

export interface FileItem {
  name: string;
  url: string;
  path: string;
  size: number;
  modified: string;
  isDirectory: boolean;
}

export interface FileManagerProps {
  isOpen: boolean;
  onClose?: () => void;
  onSelectFile?: (fileUrl: string, item?: FileItem) => void;
  onSelectFiles?: (fileUrls: string[], items?: FileItem[]) => void;
  accept?: string;
  mode?: "image" | "document" | "all";
  multiSelect?: boolean;
  canManageFiles?: boolean;
  embedded?: boolean;
  zIndex?: number;
  title?: string;
}

type ViewMode = "grid" | "list";

export default function FileManager({
  isOpen,
  onClose,
  onSelectFile,
  onSelectFiles,
  accept,
  mode = "all",
  multiSelect = false,
  canManageFiles,
  embedded = false,
  zIndex = 1100,
  title,
}: FileManagerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [canManage, setCanManage] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(24);
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "image" | "document">(
    mode === "image" ? "image" : mode === "document" ? "document" : "all"
  );
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Xác định quyền quản lý (xóa, sửa tên)
  useEffect(() => {
    if (typeof canManageFiles === "boolean") {
      setCanManage(canManageFiles);
      return;
    }

    let isMounted = true;
    api
      .get<{ role?: string }>("/auth/me")
      .then((res) => {
        if (!isMounted) return;
        const role = res.data?.role || "";
        const allowed = ["SUPER_ADMIN", "ADMIN", "DISPATCHER"].includes(role);
        setCanManage(allowed);
      })
      .catch(() => {
        if (isMounted) setCanManage(false);
      });

    return () => {
      isMounted = false;
    };
  }, [canManageFiles, isOpen]);

  // Tải danh sách file từ API
  const loadFiles = useCallback(
    async (page = 1, currentSearch = searchQuery, currentType = filterType) => {
      if (!isOpen) return;
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          page: String(page),
          limit: String(itemsPerPage),
        });

        if (currentSearch.trim()) {
          queryParams.set("q", currentSearch.trim());
        }

        if (currentType !== "all") {
          queryParams.set("type", currentType);
        } else if (mode === "image" || accept === "image/*") {
          queryParams.set("type", "image");
        }

        interface FileListResponse {
          files: FileItem[];
          total: number;
          totalPages: number;
          page: number;
        }
        const res = await api.get<FileListResponse>(`/files/list?${queryParams.toString()}`);
        setFiles(res.data?.files || []);
        setTotalFiles(res.data?.total || 0);
        setTotalPages(res.data?.totalPages || 1);
        setCurrentPage(res.data?.page || page);
      } catch (error: unknown) {
        console.error("FileManager: Error loading files:", error);
        const err = error as { response?: { data?: { error?: string } }; message?: string };
        toast.error(err.response?.data?.error || err.message || "Lỗi khi tải danh sách file");
      } finally {
        setLoading(false);
      }
    },
    [isOpen, itemsPerPage, searchQuery, filterType, mode, accept]
  );

  useEffect(() => {
    if (isOpen) {
      loadFiles(1);
      setSelectedFiles(new Set());
    }
  }, [isOpen, loadFiles]);

  // Upload danh sách file
  const uploadFiles = async (filesToUpload: File[]) => {
    if (!filesToUpload || filesToUpload.length === 0) return;

    if (mode === "image" || accept === "image/*") {
      const invalidFiles = filesToUpload.filter(
        (f) => !f.type.startsWith("image/")
      );
      if (invalidFiles.length > 0) {
        toast.error("Vui lòng chỉ chọn tệp tin hình ảnh!");
        return;
      }
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const file of filesToUpload) {
        try {
          let fileToUpload: File = file;
          // Nén ảnh nếu file lớn hơn 500KB
          if (file.size > 500 * 1024 && file.type.startsWith("image/")) {
            try {
              fileToUpload = await compressImage(file, {
                maxWidthOrHeight: 1920,
                quality: 0.85,
              });
            } catch (err) {
              console.warn("Nén ảnh thất bại, dùng file gốc:", err);
              fileToUpload = file;
            }
          }

          const formData = new FormData();
          formData.append("file", fileToUpload, fileToUpload.name);

          const res = (await api.post("/files/upload", formData)) as {
            data?: { success?: boolean; error?: string };
          };
          if (res.data && res.data.success) {
            successCount++;
          } else {
            failCount++;
            toast.error(`Lỗi tải file ${file.name}: ${res.data?.error || "Lỗi"}`);
          }
        } catch (err: unknown) {
          failCount++;
          console.error(`Upload error for ${file.name}:`, err);
          const eObj = err as { response?: { data?: { error?: string } }; message?: string };
          toast.error(eObj.response?.data?.error || eObj.message || `Lỗi tải file ${file.name}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Đã tải lên thành công ${successCount} tệp tin!`);
        await new Promise((r) => setTimeout(r, 600));
        loadFiles(1);
      }
      if (failCount > 0 && successCount === 0) {
        toast.error(`Không thể tải lên ${failCount} tệp tin.`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFiles = Array.from(e.target.files || []);
    await uploadFiles(chosenFiles);
  };

  // 1. Lắng nghe Clipboard Paste (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowPaste = async (e: ClipboardEvent) => {
      if (uploading) return;
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      const clipboardFiles: File[] = [];
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const rawExt = item.type.split("/")[1] || "png";
            const ext = rawExt === "jpeg" ? "jpg" : rawExt.replace(/[^a-z0-9]/gi, "");
            const fileName = `clipboard_${dateStr}_${timeStr}_${i + 1}.${ext}`;
            const file = new File([blob], fileName, { type: item.type || "image/png" });
            clipboardFiles.push(file);
          }
        }
      }

      if (clipboardFiles.length > 0) {
        e.preventDefault();
        toast.info(`Đang dán và tải lên ${clipboardFiles.length} ảnh từ Clipboard...`);
        await uploadFiles(clipboardFiles);
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [isOpen, uploading]);

  // 2. Nút bấm "Dán Clipboard"
  const handlePasteFromClipboard = async () => {
    if (uploading) return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        toast.info("Trình duyệt không hỗ trợ đọc Clipboard tự động. Vui lòng bấm Ctrl + V để dán ảnh!");
        return;
      }

      const clipboardItems = await navigator.clipboard.read();
      const clipboardFiles: File[] = [];
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");
      let idx = 1;

      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const rawExt = type.split("/")[1] || "png";
            const ext = rawExt === "jpeg" ? "jpg" : rawExt.replace(/[^a-z0-9]/gi, "");
            const fileName = `clipboard_${dateStr}_${timeStr}_${idx++}.${ext}`;
            const file = new File([blob], fileName, { type });
            clipboardFiles.push(file);
          }
        }
      }

      if (clipboardFiles.length === 0) {
        toast.warning("Không tìm thấy ảnh trong Clipboard. Vui lòng sao chép một ảnh và thử lại (hoặc nhấn Ctrl + V)!");
        return;
      }

      toast.info(`Tìm thấy ${clipboardFiles.length} ảnh trong Clipboard. Đang tải lên...`);
      await uploadFiles(clipboardFiles);
    } catch {
      toast.info("Vui lòng nhấn tổ hợp phím Ctrl + V (hoặc Cmd + V) để dán ảnh từ Clipboard!");
    }
  };

  // 3. Kéo & thả file (Drag and Drop)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      await uploadFiles(droppedFiles);
    }
  };

  // 4. Sao chép link file
  const handleCopyLink = (fileUrl: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const fullUrl = fileUrl.startsWith("http")
      ? fileUrl
      : `${window.location.origin}${fileUrl}`;

    navigator.clipboard
      .writeText(fullUrl)
      .then(() => {
        toast.success("Đã sao chép đường dẫn file!");
      })
      .catch(() => {
        toast.error("Không thể sao chép đường dẫn");
      });
  };

  // 5. Xóa file
  const handleDeleteFile = async (file: FileItem) => {
    if (!canManage) {
      toast.error("Bạn không có quyền xóa tệp tin");
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa tệp tin "${file.name}"?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const target = encodeURIComponent(file.path || file.url || file.name);
      await api.delete(`/files/delete?file=${target}`);
      toast.success("Đã xóa file thành công");
      loadFiles(currentPage);
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        next.delete(file.url);
        return next;
      });
    } catch (error: unknown) {
      console.error("Lỗi xóa file:", error);
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || "Lỗi khi xóa file");
    } finally {
      setIsDeleting(false);
    }
  };

  // 6. Xóa hàng loạt file đã chọn
  const handleDeleteSelected = async () => {
    if (!canManage) {
      toast.error("Bạn không có quyền xóa tệp tin");
      return;
    }

    if (selectedFiles.size === 0) {
      toast.warning("Vui lòng chọn ít nhất một file để xóa");
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedFiles.size} tệp tin đã chọn?`)) {
      return;
    }

    const selectedItems = files.filter((f) => selectedFiles.has(f.url));
    setIsDeleting(true);
    let success = 0;
    let fail = 0;

    try {
      for (const file of selectedItems) {
        try {
          const target = encodeURIComponent(file.path || file.url || file.name);
          await api.delete(`/files/delete?file=${target}`);
          success++;
        } catch {
          fail++;
        }
      }

      if (success > 0) {
        toast.success(`Đã xóa ${success} tệp tin thành công`);
      }
      if (fail > 0) {
        toast.error(`Không thể xóa ${fail} tệp tin`);
      }

      loadFiles(currentPage);
      setSelectedFiles(new Set());
    } finally {
      setIsDeleting(false);
    }
  };

  // 7. Đổi tên file
  const handleRenameFile = async (file: FileItem, newName: string) => {
    if (!canManage) {
      toast.error("Bạn không có quyền đổi tên tệp tin");
      setRenamingFile(null);
      return;
    }

    if (!newName || !newName.trim()) {
      toast.error("Tên file không được để trống");
      return;
    }

    if (newName.trim() === file.name) {
      setRenamingFile(null);
      return;
    }

    try {
      await api.post("/files/rename", {
        oldName: file.name,
        oldPath: file.path || file.url,
        newName: newName.trim(),
      });
      toast.success("Đổi tên file thành công");
      loadFiles(currentPage);
      setRenamingFile(null);
      setNewFileName("");
    } catch (error: unknown) {
      console.error("Lỗi đổi tên file:", error);
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || "Lỗi khi đổi tên file");
    }
  };

  // 8. Chọn file
  const selectionEnabled = multiSelect || canManage;

  const handleSelectFile = (file: FileItem) => {
    if (selectionEnabled) {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(file.url)) {
          next.delete(file.url);
        } else {
          next.add(file.url);
        }
        return next;
      });
    } else {
      setSelectedFiles(new Set([file.url]));
    }
  };

  const handleDoubleClickFile = (file: FileItem) => {
    if (renamingFile === file.name) return;
    if (onSelectFile || onSelectFiles) {
      if (multiSelect) {
        if (onSelectFiles) onSelectFiles([file.url], [file]);
        else if (onSelectFile) onSelectFile(file.url, file);
      } else {
        if (onSelectFile) onSelectFile(file.url, file);
        else if (onSelectFiles) onSelectFiles([file.url], [file]);
      }
      if (onClose) onClose();
    }
  };

  const handleSelectAll = () => {
    if (!selectionEnabled) return;
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.url)));
    }
  };

  // Xác nhận chọn file cho Modal Picker mode
  const handleConfirmSelection = () => {
    if (selectedFiles.size === 0) {
      toast.warning("Vui lòng chọn ít nhất một file");
      return;
    }

    const selectedUrls = Array.from(selectedFiles);
    const selectedItems = files.filter((f) => selectedFiles.has(f.url));

    if (multiSelect) {
      if (onSelectFiles) {
        onSelectFiles(selectedUrls, selectedItems);
      } else if (onSelectFile && selectedUrls[0]) {
        onSelectFile(selectedUrls[0], selectedItems[0]);
      }
    } else {
      const firstUrl = selectedUrls[0];
      const firstItem = selectedItems[0];
      if (firstUrl && onSelectFile) {
        onSelectFile(firstUrl, firstItem);
      }
    }

    if (onClose) onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.toLowerCase().split(".").pop();
    const iconMap: Record<string, string> = {
      jpg: "fa-image text-success",
      jpeg: "fa-image text-success",
      png: "fa-image text-success",
      gif: "fa-image text-success",
      webp: "fa-image text-success",
      svg: "fa-image text-success",
      pdf: "fa-file-pdf text-danger",
      doc: "fa-file-word text-primary",
      docx: "fa-file-word text-primary",
      xls: "fa-file-excel text-success",
      xlsx: "fa-file-excel text-success",
      csv: "fa-file-csv text-success",
      zip: "fa-file-archive text-warning",
      rar: "fa-file-archive text-warning",
      txt: "fa-file-alt text-secondary",
    };
    return iconMap[ext || ""] || "fa-file text-secondary";
  };

  if (!isOpen) return null;

  const Wrapper = embedded
    ? ({ children }: { children: React.ReactNode }) => (
        <div className="card shadow-sm border-0 w-100 h-100 bg-white" style={{ minHeight: "650px" }}>
          {children}
        </div>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex }}
          tabIndex={-1}
        >
          <div
            className={`modal-dialog ${
              isFullscreen ? "modal-fullscreen" : "modal-xl"
            } modal-dialog-scrollable`}
            style={{ zIndex: zIndex + 1 }}
          >
            <div className="modal-content shadow-lg border-0">{children}</div>
          </div>
        </div>
      );

  return (
    <>
      <Wrapper>
        {/* Header */}
        <div
          className={
            embedded
              ? "card-header d-flex flex-wrap align-items-center justify-content-between py-2 px-3 bg-white border-bottom gap-2"
              : "modal-header d-flex flex-wrap align-items-center justify-content-between py-2 px-3 gap-2"
          }
        >
          <div className="d-flex align-items-center gap-2">
            <h5 className="modal-title mb-0 d-flex align-items-center fw-bold fs-6">
              <i className="fas fa-folder-open text-primary me-2"></i>
              <span>{title || "Thư viện Media"}</span>
              {selectedFiles.size > 0 && (
                <span className="badge rounded-pill bg-primary ms-2 shadow-sm" style={{ fontSize: "0.7rem" }}>
                  Đã chọn {selectedFiles.size}
                </span>
              )}
            </h5>
          </div>

          <div className="d-flex flex-wrap gap-1 gap-sm-2 align-items-center">
            {/* Tải lại */}
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm rounded-pill d-flex align-items-center px-2 py-1"
              onClick={() => loadFiles(currentPage)}
              disabled={loading || uploading}
              style={{ fontSize: "0.8rem" }}
              title="Tải lại danh sách"
            >
              <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`}></i>
              <span className="d-none d-sm-inline ms-1">Tải lại</span>
            </button>

            {/* Dán từ Clipboard */}
            <button
              type="button"
              className="btn btn-warning btn-sm rounded-pill d-flex align-items-center px-2.5 py-1 shadow-sm text-dark fw-medium"
              onClick={handlePasteFromClipboard}
              disabled={uploading}
              style={{ fontSize: "0.8rem" }}
              title="Dán ảnh trực tiếp từ Clipboard (Ctrl + V)"
            >
              <i className="fas fa-paste text-dark"></i>
              <span className="d-none d-sm-inline ms-1">Dán ảnh</span>
            </button>

            {/* Chụp ảnh trực tiếp trên mobile/tablet */}
            <button
              type="button"
              className="btn btn-info btn-sm rounded-pill d-flex align-items-center px-2.5 py-1 shadow-sm text-white"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: "0.8rem" }}
              title="Chụp ảnh trực tiếp bằng Camera"
            >
              <i className="fas fa-camera"></i>
              <span className="d-none d-sm-inline ms-1">Chụp ảnh</span>
            </button>

            {/* Tải file lên */}
            <button
              type="button"
              className="btn btn-primary btn-sm rounded-pill d-flex align-items-center px-2.5 py-1 shadow-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: "0.8rem" }}
              title="Tải tệp tin lên"
            >
              <i className="fas fa-cloud-upload-alt"></i>
              <span className="d-none d-sm-inline ms-1">Tải lên</span>
            </button>

            {/* Phóng to / Thu nhỏ modal */}
            {!embedded && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary rounded-pill d-flex align-items-center justify-content-center p-0"
                onClick={() => setIsFullscreen(!isFullscreen)}
                style={{ width: "28px", height: "28px" }}
                title={isFullscreen ? "Thu nhỏ" : "Phóng to toàn màn hình"}
              >
                <i className={`fas ${isFullscreen ? "fa-compress" : "fa-expand"}`} style={{ fontSize: "0.75rem" }}></i>
              </button>
            )}

            {/* Nút đóng */}
            {onClose && !embedded && (
              <button
                type="button"
                className="btn-close ms-1"
                onClick={onClose}
                aria-label="Đóng"
              ></button>
            )}
          </div>
        </div>

        {/* Body */}
        <div
          className="modal-body position-relative p-3"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ minHeight: "450px" }}
        >
          {/* Drag & Drop overlay */}
          {isDragging && (
            <div
              className="position-absolute top-0 start-0 w-100 h-100 border border-primary border-3 border-dashed rounded d-flex flex-column align-items-center justify-content-center text-primary"
              style={{
                zIndex: 1000,
                backgroundColor: "rgba(239, 246, 255, 0.9)",
                backdropFilter: "blur(2px)",
              }}
            >
              <i className="fas fa-cloud-upload-alt fa-3x mb-2 animate-bounce"></i>
              <h5 className="fw-bold mb-1">Thả tệp tin vào đây để tải lên</h5>
              <p className="small text-muted mb-0">Hỗ trợ nhiều file cùng lúc, tự động tối ưu dung lượng</p>
            </div>
          )}

          {/* Mẹo thông minh */}
          <div className="alert alert-light border py-1.5 px-3 mb-3 d-flex align-items-center justify-content-between text-muted small rounded-3 bg-light">
            <div className="d-flex align-items-center gap-2">
              <i className="fas fa-lightbulb text-warning fs-6"></i>
              <span>
                <strong>Mẹo nhanh:</strong> Nhấn <kbd className="bg-secondary text-white px-1 rounded">Ctrl</kbd> +{" "}
                <kbd className="bg-secondary text-white px-1 rounded">V</kbd> ở bất kỳ đâu để dán và tải ảnh trực tiếp từ bộ nhớ tạm!
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-warning text-dark py-0 px-2 rounded-pill ms-2 text-nowrap"
              onClick={handlePasteFromClipboard}
              style={{ fontSize: "0.75rem" }}
            >
              <i className="fas fa-paste me-1"></i> Dán ngay
            </button>
          </div>

          {/* Thanh công cụ tìm kiếm và bộ lọc */}
          <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 pb-2 border-bottom gap-2">
            <div className="d-flex flex-wrap gap-2 align-items-center flex-grow-1">
              {/* Ô tìm kiếm */}
              <div className="input-group input-group-sm" style={{ maxWidth: "260px" }}>
                <span className="input-group-text bg-white border-end-0 text-muted">
                  <i className="fas fa-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 ps-0"
                  placeholder="Tìm tên tệp tin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      loadFiles(1, searchQuery, filterType);
                    }
                  }}
                />
                {searchQuery && (
                  <button
                    className="btn btn-outline-secondary border-start-0"
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      loadFiles(1, "", filterType);
                    }}
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>

              {/* Lọc loại file */}
              <div className="btn-group btn-group-sm" role="group">
                <button
                  type="button"
                  className={`btn ${filterType === "all" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => {
                    setFilterType("all");
                    loadFiles(1, searchQuery, "all");
                  }}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={`btn ${filterType === "image" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => {
                    setFilterType("image");
                    loadFiles(1, searchQuery, "image");
                  }}
                >
                  <i className="fas fa-image me-1"></i> Hình ảnh
                </button>
                <button
                  type="button"
                  className={`btn ${filterType === "document" ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => {
                    setFilterType("document");
                    loadFiles(1, searchQuery, "document");
                  }}
                >
                  <i className="fas fa-file-alt me-1"></i> Tài liệu
                </button>
              </div>

              {/* Chọn tất cả */}
              {selectionEnabled && files.length > 0 && (
                <button
                  type="button"
                  className={`btn btn-sm rounded-3 ${
                    selectedFiles.size === files.length
                      ? "btn-primary shadow-sm"
                      : "btn-outline-secondary"
                  }`}
                  onClick={handleSelectAll}
                  disabled={isDeleting}
                  title={
                    selectedFiles.size === files.length
                      ? "Bỏ chọn tất cả"
                      : "Chọn tất cả"
                  }
                >
                  <i
                    className={`fas ${
                      selectedFiles.size === files.length
                        ? "fa-check-double"
                        : "fa-check-square"
                    }`}
                  ></i>
                  <span className="d-none d-md-inline ms-1">
                    {selectedFiles.size === files.length ? "Bỏ chọn" : "Chọn hết"}
                  </span>
                </button>
              )}

              {/* Nút xóa các file đã chọn */}
              {canManage && selectedFiles.size > 0 && (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm rounded-3 shadow-sm"
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <>
                      <i className="fas fa-trash me-1"></i>
                      <span>Xóa {selectedFiles.size} mục</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Chuyển đổi dạng xem Lưới / Danh sách */}
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className={`btn ${viewMode === "grid" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setViewMode("grid")}
                title="Xem dạng lưới"
              >
                <i className="fas fa-th"></i>
              </button>
              <button
                type="button"
                className={`btn ${viewMode === "list" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setViewMode("list")}
                title="Xem dạng danh sách"
              >
                <i className="fas fa-list"></i>
              </button>
            </div>
          </div>

          {/* Ẩn các file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept={accept}
            multiple
            style={{ display: "none" }}
          />
          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
          />

          {/* Thông báo tiến trình */}
          {uploading && (
            <div className="alert alert-info py-2 mb-3 d-flex align-items-center gap-2 small">
              <i className="fas fa-spinner fa-spin"></i>
              <span>Đang tối ưu & tải file lên hệ thống...</span>
            </div>
          )}
          {isDeleting && !uploading && (
            <div className="alert alert-warning py-2 mb-3 d-flex align-items-center gap-2 small">
              <i className="fas fa-spinner fa-spin"></i>
              <span>Đang xử lý xóa tệp tin...</span>
            </div>
          )}

          {/* Vùng hiển thị file */}
          {loading ? (
            <div className="text-center py-5 text-muted">
              <i className="fas fa-spinner fa-spin fa-2x mb-2 text-primary"></i>
              <p className="small mb-0">Đang tải danh sách media...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="fas fa-photo-video fa-3x mb-3 text-secondary opacity-50"></i>
              <h6 className="fw-semibold">Không tìm thấy tệp tin nào</h6>
              <p className="small mb-3">Kéo thả file vào đây hoặc bấm Tải lên để bắt đầu.</p>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm rounded-pill"
                onClick={() => fileInputRef.current?.click()}
              >
                <i className="fas fa-plus me-1"></i> Tải file ngay
              </button>
            </div>
          ) : viewMode === "grid" ? (
            /* DẠNG LƯỚI (GRID VIEW) */
            <div
              className="row g-2"
              style={{
                maxHeight: isFullscreen ? "calc(100vh - 250px)" : "560px",
                overflowY: "auto",
              }}
            >
              {files.map((file) => {
                const isImage = file.name
                  .toLowerCase()
                  .match(/\.(jpg|jpeg|png|gif|webp|svg)$/);
                const isSelected = selectedFiles.has(file.url);
                const isRenaming = renamingFile === file.name;

                return (
                  <div key={file.url} className="col-xl-2 col-lg-3 col-md-4 col-sm-6 col-6">
                    <div
                      className={`card h-100 border file-card ${isSelected ? "selected border-primary" : "border-light-subtle"}`}
                      style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
                      onClick={() => !isRenaming && handleSelectFile(file)}
                      onDoubleClick={() => handleDoubleClickFile(file)}
                    >
                      <div className="card-body p-1 text-center d-flex flex-column" style={{ minHeight: "140px" }}>
                        {/* Thumbnail */}
                        <div
                          className="flex-grow-1 d-flex align-items-center justify-content-center p-1 bg-light rounded position-relative"
                          style={{ height: "105px", overflow: "hidden" }}
                        >
                          {isImage ? (
                            <img
                              src={file.url}
                              alt={file.name}
                              className="img-fluid"
                              style={{
                                maxHeight: "100%",
                                width: "auto",
                                maxWidth: "100%",
                                objectFit: "contain",
                              }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                const parent = target.parentElement;
                                if (parent) {
                                  const iconDiv = document.createElement("div");
                                  iconDiv.className = "py-2";
                                  iconDiv.innerHTML = `<i class="fas ${getFileIcon(file.name)} fa-3x"></i>`;
                                  parent.appendChild(iconDiv);
                                }
                              }}
                            />
                          ) : (
                            <div className="py-2">
                              <i className={`fas ${getFileIcon(file.name)} fa-3x`}></i>
                            </div>
                          )}

                          {/* Nút Xem lớn ảnh */}
                          {isImage && (
                            <button
                              type="button"
                              className="btn btn-sm btn-dark bg-opacity-75 text-white position-absolute bottom-0 end-0 m-1 rounded-circle p-0 preview-btn"
                              style={{ width: "24px", height: "24px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(file.url);
                              }}
                              title="Xem ảnh đầy đủ"
                            >
                              <i className="fas fa-search-plus" style={{ fontSize: "10px" }}></i>
                            </button>
                          )}
                        </div>

                        {/* Tên file & Đổi tên */}
                        {isRenaming && canManage ? (
                          <input
                            type="text"
                            className="form-control form-control-sm mt-1"
                            style={{ fontSize: "0.75rem" }}
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            onBlur={() => {
                              if (newFileName.trim()) {
                                handleRenameFile(file, newFileName);
                              } else {
                                setRenamingFile(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameFile(file, newFileName);
                              } else if (e.key === "Escape") {
                                setRenamingFile(null);
                                setNewFileName("");
                              }
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="mt-1 px-1 overflow-hidden text-start">
                            <small
                              className="d-block text-truncate fw-medium mb-0 text-dark"
                              title={file.name}
                              style={{ fontSize: "0.75rem", lineHeight: "1.2" }}
                            >
                              {file.name}
                            </small>
                            <div className="d-flex justify-content-between align-items-center mt-0.5">
                              <small className="text-muted" style={{ fontSize: "0.65rem" }}>
                                {formatFileSize(file.size)}
                              </small>
                              <small className="text-muted" style={{ fontSize: "0.65rem" }}>
                                {formatDateDisplay(file.modified)}
                              </small>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Huy hiệu Đã chọn */}
                      {isSelected && (
                        <div className="position-absolute top-0 start-0 m-1" style={{ zIndex: 12 }}>
                          <div
                            className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center shadow"
                            style={{ width: "22px", height: "22px" }}
                          >
                            <i className="fas fa-check" style={{ fontSize: "10px" }}></i>
                          </div>
                        </div>
                      )}

                      {/* Menu thao tác nhanh khi di chuột */}
                      {!isRenaming && (
                        <div
                          className="file-actions position-absolute top-0 end-0 d-flex flex-column gap-1 opacity-0 m-1"
                          style={{ transition: "all 0.2s ease", zIndex: 15 }}
                        >
                          <button
                            type="button"
                            className="btn btn-light shadow-sm rounded-circle d-flex align-items-center justify-content-center border p-0"
                            style={{ width: "24px", height: "24px" }}
                            onClick={(e) => handleCopyLink(file.url, e)}
                            title="Sao chép liên kết"
                          >
                            <i className="fas fa-link text-info" style={{ fontSize: "10px" }}></i>
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                className="btn btn-light shadow-sm rounded-circle d-flex align-items-center justify-content-center border p-0"
                                style={{ width: "24px", height: "24px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingFile(file.name);
                                  setNewFileName(file.name);
                                }}
                                title="Đổi tên file"
                              >
                                <i className="fas fa-pencil-alt text-primary" style={{ fontSize: "10px" }}></i>
                              </button>
                              <button
                                type="button"
                                className="btn btn-light shadow-sm rounded-circle d-flex align-items-center justify-content-center border p-0"
                                style={{ width: "24px", height: "24px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(file);
                                }}
                                title="Xóa file"
                              >
                                <i className="fas fa-trash text-danger" style={{ fontSize: "10px" }}></i>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* DẠNG DANH SÁCH (LIST VIEW) */
            <div
              className="table-responsive"
              style={{
                maxHeight: isFullscreen ? "calc(100vh - 250px)" : "500px",
                overflowY: "auto",
              }}
            >
              <table className="table table-hover table-sm align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    {selectionEnabled && (
                      <th style={{ width: "40px" }} className="text-center">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selectedFiles.size === files.length && files.length > 0}
                          onChange={handleSelectAll}
                        />
                      </th>
                    )}
                    <th style={{ width: "50px" }}>Xem</th>
                    <th>Tên tệp tin</th>
                    <th style={{ width: "120px" }}>Kích thước</th>
                    <th style={{ width: "130px" }}>Ngày sửa</th>
                    <th style={{ width: "110px" }} className="text-end pe-3">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => {
                    const isImage = file.name
                      .toLowerCase()
                      .match(/\.(jpg|jpeg|png|gif|webp|svg)$/);
                    const isSelected = selectedFiles.has(file.url);
                    const isRenaming = renamingFile === file.name;

                    return (
                      <tr
                        key={file.url}
                        className={isSelected ? "table-primary" : ""}
                        style={{ cursor: "pointer" }}
                        onClick={() => !isRenaming && handleSelectFile(file)}
                        onDoubleClick={() => handleDoubleClickFile(file)}
                      >
                        {selectionEnabled && (
                          <td className="text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={isSelected}
                              onChange={() => handleSelectFile(file)}
                            />
                          </td>
                        )}
                        <td>
                          {isImage ? (
                            <img
                              src={file.url}
                              alt={file.name}
                              style={{
                                width: "40px",
                                height: "40px",
                                objectFit: "cover",
                                borderRadius: "4px",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(file.url);
                              }}
                            />
                          ) : (
                            <i className={`fas ${getFileIcon(file.name)} fa-2x`}></i>
                          )}
                        </td>
                        <td>
                          {isRenaming && canManage ? (
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={newFileName}
                              onChange={(e) => setNewFileName(e.target.value)}
                              onBlur={() => {
                                if (newFileName.trim()) {
                                  handleRenameFile(file, newFileName);
                                } else {
                                  setRenamingFile(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRenameFile(file, newFileName);
                                } else if (e.key === "Escape") {
                                  setRenamingFile(null);
                                  setNewFileName("");
                                }
                              }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div>
                              <div className="fw-semibold text-dark small">{file.name}</div>
                              {isSelected && (
                                <small className="text-primary" style={{ fontSize: "11px" }}>
                                  <i className="fas fa-check-circle me-1"></i> Đã chọn
                                </small>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="small text-muted">{formatFileSize(file.size)}</td>
                        <td className="small text-muted">{formatDateDisplay(file.modified)}</td>
                        <td className="text-end pe-3" onClick={(e) => e.stopPropagation()}>
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-outline-info"
                              onClick={(e) => handleCopyLink(file.url, e)}
                              title="Sao chép link"
                            >
                              <i className="fas fa-link"></i>
                            </button>
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline-primary"
                                  onClick={() => {
                                    setRenamingFile(file.name);
                                    setNewFileName(file.name);
                                  }}
                                  title="Đổi tên"
                                >
                                  <i className="fas fa-pencil-alt"></i>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger"
                                  onClick={() => handleDeleteFile(file)}
                                  title="Xóa"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer d-flex flex-wrap justify-content-between align-items-center py-2 px-3 border-top bg-light">
          <div className="text-muted small">
            Tổng: <strong className="text-dark">{totalFiles}</strong> tệp tin • Trang{" "}
            <strong>{currentPage}</strong> / {totalPages}
            {selectedFiles.size > 0 && ` • Đã chọn: ${selectedFiles.size}`}
          </div>

          {/* Phân trang */}
          {totalPages > 1 && (
            <nav aria-label="Media pagination">
              <ul className="pagination pagination-sm mb-0">
                <li className={`page-item ${currentPage === 1 ? "disabled" : ""}`}>
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => loadFiles(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                  >
                    <i className="fas fa-chevron-left"></i>
                  </button>
                </li>

                {[...Array(totalPages)].map((_, i) => {
                  const pageNum = i + 1;
                  if (
                    pageNum === 1 ||
                    pageNum === totalPages ||
                    (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                  ) {
                    return (
                      <li
                        key={pageNum}
                        className={`page-item ${currentPage === pageNum ? "active" : ""}`}
                      >
                        <button
                          type="button"
                          className="page-link"
                          onClick={() => loadFiles(pageNum)}
                          disabled={loading}
                        >
                          {pageNum}
                        </button>
                      </li>
                    );
                  } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                    return (
                      <li key={pageNum} className="page-item disabled">
                        <span className="page-link">...</span>
                      </li>
                    );
                  }
                  return null;
                })}

                <li className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}>
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => loadFiles(currentPage + 1)}
                    disabled={currentPage === totalPages || loading}
                  >
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </li>
              </ul>
            </nav>
          )}

          {/* Nút hành động */}
          <div className="d-flex gap-2">
            {onClose && !embedded && (
              <button type="button" className="btn btn-secondary btn-sm px-3" onClick={onClose}>
                <i className="fas fa-times me-1"></i> Đóng
              </button>
            )}
            {!embedded && (onSelectFile || onSelectFiles) && (
              <button
                type="button"
                className="btn btn-primary btn-sm px-3"
                onClick={handleConfirmSelection}
                disabled={selectedFiles.size === 0}
              >
                <i className="fas fa-check me-1"></i> Chọn tệp tin
                {selectedFiles.size > 1 ? ` (${selectedFiles.size})` : ""}
              </button>
            )}
          </div>
        </div>
      </Wrapper>

      {/* Lightbox / Modal xem trước ảnh lớn */}
      {previewImage && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.85)", zIndex: zIndex + 100 }}
          onClick={() => setPreviewImage(null)}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div
              className="modal-content bg-transparent border-0 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="d-flex justify-content-end mb-2">
                <button
                  type="button"
                  className="btn btn-dark btn-sm rounded-circle text-white p-0"
                  style={{ width: "32px", height: "32px" }}
                  onClick={() => setPreviewImage(null)}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <img
                src={previewImage}
                alt="Xem trước ảnh"
                className="img-fluid rounded shadow-lg mx-auto"
                style={{ maxHeight: "80vh", objectFit: "contain" }}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .file-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .file-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        }
        .file-card:hover .file-actions,
        .file-card.selected .file-actions {
          opacity: 1 !important;
        }
        .file-card.selected {
          background-color: rgba(13, 110, 253, 0.04);
        }
      `}</style>
    </>
  );
}
