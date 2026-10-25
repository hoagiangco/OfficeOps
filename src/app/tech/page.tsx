"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { Loading } from "@/components/Loading";
import { CameraQRScanner } from "@/components/CameraQRScanner";
import FileManager from "@/components/FileManager";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
} from "@/lib/labels";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { getDirectionsUrl } from "@/lib/location";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

interface TechTicketAttachment {
  id: string;
  url: string;
  kind: string;
  createdAt: string;
}

interface TechTicket {
  id: string;
  code: string;
  assigneeId?: string | null;
  assignee?: { id: string; name: string } | null;
  type: string;
  status: string;
  priority: string;
  description: string;
  diagnosis: string | null;
  checkInAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  counterAtClose: number | null;
  customerSignature: string | null;
  slaDueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    brand: string | null;
    status: string;
    currentCounter: number;
    locationNote: string | null;
    department?: {
      name: string;
      building?: {
        name: string;
        branch?: { name: string };
      };
    } | null;
  };
  attachments?: TechTicketAttachment[];
}

interface PartItem {
  id: string;
  partCode: string;
  name: string;
  unit: string;
  totalQuantity: number;
}

interface UserProfile {
  userId: string;
  name: string;
  role: string;
  email: string;
  phone?: string | null;
  region?: string | null;
  skills?: string[];
}

interface EquipmentLookup {
  id: string;
  serialNumber: string;
  model: string;
  brand: string | null;
  status: string;
  currentCounter: number;
  qrCode: string;
  healthScore: number;
  customer?: { id: string; name: string; phone: string; address: string } | null;
  department?: {
    name: string;
    building?: { name: string; branch?: { name: string } };
  } | null;
}

const formatCompactDateTime = (dStr?: string | null): string => {
  if (!dStr) return "";
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${time} ${day}/${month}`;
};

const formatCompactDateOnly = (dStr?: string | null): string => {
  if (!dStr) return "";
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

export default function TechMobilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"jobs" | "parts" | "profile">("jobs");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  // Danh sách công việc
  const [tickets, setTickets] = useState<TechTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE_ALL");
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine">("all");

  // Xử lý chi tiết Ticket được chọn
  const [selectedTicket, setSelectedTicket] = useState<TechTicket | null>(null);
  const [actionStep, setActionStep] = useState<"detail" | "checkin" | "parts" | "complete">("detail");

  // Form xử lý ticket
  const [diagnosis, setDiagnosis] = useState("");
  const [newCounter, setNewCounter] = useState<number | "">("");
  const [signature, setSignature] = useState<string | null>(null);
  const [closingNote, setClosingNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showTechMediaPicker, setShowTechMediaPicker] = useState(false);
  const [techMediaKind, setTechMediaKind] = useState<"PHOTO" | "COUNTER_PHOTO">("PHOTO");

  // Đề xuất linh kiện
  const [parts, setParts] = useState<PartItem[]>([]);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [partQty, setPartQty] = useState(1);
  const [requestReason, setRequestReason] = useState("");
  const [submittingPart, setSubmittingPart] = useState(false);

  // Tra cứu mã QR
  const [showQRModal, setShowQRModal] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [qrQuery, setQrQuery] = useState("");
  const [qrResult, setQrResult] = useState<EquipmentLookup | null>(null);
  const [qrSearching, setQrSearching] = useState(false);

  // Tạo nhanh ticket từ tra cứu QR
  const [showQuickTicket, setShowQuickTicket] = useState(false);
  const [quickTicketType, setQuickTicketType] = useState("REPAIR");
  const [quickTicketPriority, setQuickTicketPriority] = useState("NORMAL");
  const [quickTicketDesc, setQuickTicketDesc] = useState("");

  const isSelectedCompleted = selectedTicket?.status === "COMPLETED";
  const isSuperAdmin = profile?.role === "SUPER_ADMIN";
  const isSelectedLocked = isSelectedCompleted && !isSuperAdmin;

  const signatureRef = useRef<HTMLDivElement | null>(null);

  // Tải thông tin tài khoản
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Chưa đăng nhập");
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch(() => router.push("/login"));
  }, [router]);

  // Tải danh sách ticket của KTV này
  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets?pageSize=100");
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        setTickets(items);
      }
    } catch {
      toast.error("Không thể tải danh sách công việc");
    } finally {
      setLoading(false);
    }
  }, []);

  // Tải danh sách linh kiện trong kho
  const loadParts = useCallback(async () => {
    try {
      const res = await fetch("/api/parts?pageSize=100");
      if (res.ok) {
        const data = await res.json();
        setParts(data.items || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTickets();
    loadParts();
  }, [loadTickets, loadParts]);

  // Quyền: Quản lý / Giám đốc / Điều phối được xem toàn bộ; KTV chỉ xem việc được phân công
  const isManager =
    profile?.role === "SUPER_ADMIN" ||
    profile?.role === "ADMIN" ||
    profile?.role === "DISPATCHER";

  // Lọc theo phạm vi (việc của tôi vs toàn bộ hệ thống)
  // - Kỹ thuật viên (FIELD_TECH): chỉ nhìn thấy công việc được phân công cho chính mình
  // - Quản lý / Giám đốc: hiển thị đầy đủ, cho phép chuyển đổi giữa Toàn bộ và Của tôi
  const scopedTickets = tickets.filter((t) => {
    if (!isManager) {
      return profile?.userId ? t.assigneeId === profile.userId : true;
    }
    if (scopeFilter === "mine" && profile?.userId) {
      return t.assigneeId === profile.userId;
    }
    return true;
  });

  // Số lượng thống kê nhanh
  const totalCount = scopedTickets.length;
  const activeCount = scopedTickets.filter(
    (t) => !["COMPLETED", "CANCELLED"].includes(t.status)
  ).length;
  const urgentCount = scopedTickets.filter(
    (t) => (t.priority === "URGENT" || t.priority === "HIGH") && !["COMPLETED", "CANCELLED"].includes(t.status)
  ).length;
  const inProgressCount = scopedTickets.filter(
    (t) => t.status === "IN_PROGRESS" || t.status === "WAITING_PARTS"
  ).length;
  const completedCount = scopedTickets.filter((t) => t.status === "COMPLETED").length;

  // Lọc theo trạng thái
  const filteredTickets = scopedTickets.filter((t) => {
    if (statusFilter === "ACTIVE_ALL") {
      return !["COMPLETED", "CANCELLED"].includes(t.status);
    }
    if (statusFilter === "URGENT") {
      return (
        (t.priority === "URGENT" || t.priority === "HIGH") &&
        !["COMPLETED", "CANCELLED"].includes(t.status)
      );
    }
    if (statusFilter === "IN_PROGRESS") {
      return t.status === "IN_PROGRESS" || t.status === "WAITING_PARTS";
    }
    if (statusFilter === "COMPLETED") {
      return t.status === "COMPLETED";
    }
    if (statusFilter === "ALL") {
      return true;
    }
    return true;
  });

  // Mở drawer xử lý ticket
  const openTicketAction = (t: TechTicket) => {
    setSelectedTicket(t);
    setDiagnosis(t.diagnosis || "");
    setNewCounter(t.equipment.currentCounter);
    setSignature(t.customerSignature || null);
    setClosingNote("");
    setActionStep("detail");
  };

  // Check-in GPS
  const handleCheckIn = () => {
    if (!selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền chỉnh sửa!");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị GPS");
      return;
    }

    setSubmitting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = Math.round(pos.coords.accuracy);
          const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "CHECK_IN",
              checkInLat: lat,
              checkInLng: lng,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Check-in thất bại");
          const isRecheckin = !!selectedTicket.checkInAt;
          if (acc <= 30) {
            toast.success(
              isRecheckin
                ? `Đã cập nhật lại GPS chuẩn xác (±${acc}m) cho khách hàng!`
                : `Đã check-in GPS chuẩn xác (±${acc}m) & cập nhật vị trí khách hàng!`
            );
          } else {
            toast.success(
              isRecheckin
                ? "Đã cập nhật lại vị trí check-in thành công!"
                : "Đã check-in vị trí thành công!"
            );
          }
          setSelectedTicket((prev) => (prev ? { ...prev, ...data } : data));
          loadTickets();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Lỗi check-in");
        } finally {
          setSubmitting(false);
        }
      },
      (err) => {
        setSubmitting(false);
        toast.warning(
          `Không lấy được GPS (${err.message}). Vui lòng cho phép quyền truy cập vị trí trên điện thoại!`
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Cập nhật chẩn đoán lỗi
  const handleUpdateDiagnosis = async () => {
    if (!selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền chỉnh sửa!");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE",
          diagnosis,
          status: "IN_PROGRESS",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể cập nhật");
      toast.success("Đã lưu chẩn đoán kỹ thuật");
      setSelectedTicket((prev) => (prev ? { ...prev, ...data } : data));
      loadTickets();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi cập nhật");
    } finally {
      setSubmitting(false);
    }
  };

  // Đề xuất linh kiện
  const handleRequestPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, không thể đề xuất linh kiện");
      return;
    }
    if (!selectedPartId) {
      toast.warning("Vui lòng chọn linh kiện");
      return;
    }
    setSubmittingPart(true);
    try {
      const res = await fetch("/api/stock-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          type: "TECHNICAL",
          reason: requestReason || `Đề xuất thay thế cho phiếu ${selectedTicket.code}`,
          items: [{ partId: selectedPartId, quantity: Number(partQty) }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể gửi đề xuất linh kiện");
      toast.success("Đã gửi đề xuất xuất kho linh kiện thành công!");
      setSelectedPartId("");
      setPartQty(1);
      setRequestReason("");
      setActionStep("detail");
      loadTickets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi gửi đề xuất");
    } finally {
      setSubmittingPart(false);
    }
  };

  // Hoàn tất đóng ticket
  const handleCompleteTicket = async () => {
    if (!selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền chỉnh sửa!");
      return;
    }
    const currentCounter = selectedTicket.equipment?.currentCounter ?? 0;
    if (newCounter === "" || Number(newCounter) < currentCounter) {
      toast.error(
        `Số Counter mới (${newCounter}) không được nhỏ hơn Counter hiện tại (${currentCounter})`
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "COMPLETE",
          counterAtClose: Number(newCounter),
          customerSignature: signature || undefined,
          diagnosis: diagnosis || undefined,
          note: closingNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể hoàn tất phiếu");
      toast.success("Đã hoàn tất đóng phiếu kỹ thuật thành công!");
      setSelectedTicket(null);
      loadTickets();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi hoàn tất phiếu");
    } finally {
      setSubmitting(false);
    }
  };

  // Chụp ảnh thực tế / Counter bằng camera di động
  const handleTechUploadPhoto = async (file: File, kind: "PHOTO" | "COUNTER_PHOTO") => {
    if (!selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, không thể tải thêm ảnh");
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "tickets");
      const upRes = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || "Không thể tải ảnh lên");

      const attRes = await fetch(`/api/tickets/${selectedTicket.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: upData.url,
          kind,
        }),
      });
      const attData = await attRes.json();
      if (!attRes.ok) throw new Error(attData.error || "Không thể lưu đính kèm");

      toast.success(kind === "PHOTO" ? "Đã lưu ảnh chụp thiết bị!" : "Đã lưu ảnh số Counter!");

      // Cập nhật selectedTicket với attachment mới
      const updatedAttachments = [...(selectedTicket.attachments || []), attData];
      setSelectedTicket({
        ...selectedTicket,
        attachments: updatedAttachments,
      });
      loadTickets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi chụp ảnh");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Chọn ảnh từ Thư viện Media Pickup
  const handleTechSelectMediaPhotos = async (urls: string[]) => {
    if (!selectedTicket || urls.length === 0) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, không thể tải thêm ảnh");
      return;
    }
    setUploadingPhoto(true);
    try {
      const newAttachments = [...(selectedTicket.attachments || [])];
      let count = 0;
      for (const url of urls) {
        const attRes = await fetch(`/api/tickets/${selectedTicket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            kind: techMediaKind,
          }),
        });
        if (attRes.ok) {
          const attData = await attRes.json();
          newAttachments.push(attData);
          count++;
        }
      }
      if (count > 0) {
        setSelectedTicket({
          ...selectedTicket,
          attachments: newAttachments,
        });
        toast.success(
          techMediaKind === "PHOTO"
            ? `Đã thêm ${count} ảnh thiết bị từ Thư viện!`
            : `Đã thêm ${count} ảnh counter từ Thư viện!`
        );
        loadTickets();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu ảnh");
    } finally {
      setUploadingPhoto(false);
      setShowTechMediaPicker(false);
    }
  };

  // Tra cứu mã QR / Serial
  const handleSearchQR = async (codeToSearch?: string) => {
    let q = (codeToSearch || qrQuery).trim();
    if (!q) {
      toast.warning("Vui lòng nhập mã QR hoặc số Serial máy");
      return;
    }
    // Nếu quét mã QR dạng đường link (VD: http://.../scan/QR-CODE-123), bóc tách lấy mã gốc
    if (q.includes("/scan/")) {
      const parts = q.split("/scan/");
      q = decodeURIComponent(parts[parts.length - 1].split("?")[0].trim());
    }
    setQrSearching(true);
    setQrResult(null);
    try {
      // Tìm bằng qr hoặc serial
      const res = await fetch(`/api/equipment?q=${encodeURIComponent(q)}&pageSize=5`);
      const data = await res.json();
      if (res.ok && data.items?.length > 0) {
        // Lấy chi tiết máy đầu tiên tìm thấy
        const eqId = data.items[0].id;
        const resDetail = await fetch(`/api/equipment/${eqId}`);
        if (resDetail.ok) {
          const detail = await resDetail.json();
          setQrResult(detail);
        } else {
          setQrResult(data.items[0]);
        }
      } else {
        toast.info("Không tìm thấy thiết bị nào khớp với mã này");
      }
    } catch {
      toast.error("Lỗi tra cứu thông tin thiết bị");
    } finally {
      setQrSearching(false);
    }
  };

  // Tạo nhanh ticket từ máy vừa quét QR
  const handleCreateQuickTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrResult || !qrResult.customer) {
      toast.error("Thiết bị này chưa được gán cho khách hàng nào");
      return;
    }
    if (!quickTicketDesc.trim()) {
      toast.warning("Vui lòng nhập mô tả sự cố");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: qrResult.customer.id,
          equipmentId: qrResult.id,
          type: quickTicketType,
          priority: quickTicketPriority,
          source: "CUSTOMER",
          description: quickTicketDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo phiếu");
      toast.success(`Đã tạo phiếu kỹ thuật ${data.code} thành công!`);
      setShowQuickTicket(false);
      setShowQRModal(false);
      setQuickTicketDesc("");
      loadTickets();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tạo phiếu");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div
      className="mx-auto bg-white d-flex flex-column shadow-lg position-relative"
      style={{
        maxWidth: "480px",
        minHeight: "100vh",
        paddingBottom: "80px",
      }}
    >
      {/* Top Header Mobile */}
      <header className="p-3 bg-primary text-white d-flex justify-content-between align-items-center shadow-sm sticky-top">
        <div className="d-flex align-items-center gap-2">
          <div
            className="rounded-circle bg-white text-primary d-flex align-items-center justify-content-center fw-bold shadow-sm"
            style={{ width: "40px", height: "40px", fontSize: "16px" }}
          >
            {profile?.name ? profile.name.slice(0, 2).toUpperCase() : "KT"}
          </div>
          <div>
            <div className="fw-bold fs-6 lh-sm">
              {profile?.name || (profile?.role ? (ROLE_LABELS[profile.role as Role] || profile.role) : "Kỹ thuật viên")}
            </div>
            <div className="d-flex align-items-center gap-1" style={{ fontSize: "11px", opacity: 0.9 }}>
              <span
                className="d-inline-block rounded-circle bg-success border border-white"
                style={{ width: "7px", height: "7px" }}
              ></span>
              <span>
                {profile?.role ? (ROLE_LABELS[profile.role as Role] || profile.role) : "Kỹ thuật viên"}
                {profile?.region ? ` • ${profile.region}` : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="d-flex gap-1">
          <Link
            href="/?view=desktop"
            onClick={() => {
              if (typeof window !== "undefined") {
                document.cookie = "preferred_view=desktop; path=/; max-age=86400";
                localStorage.setItem("preferred_view", "desktop");
              }
            }}
            className="btn btn-sm btn-light py-1 px-2 fw-semibold text-primary"
            style={{ fontSize: "11px" }}
            title="Chuyển sang giao diện Desktop"
          >
            <i className="fas fa-desktop me-1"></i> Desktop
          </Link>
          <button
            onClick={handleLogout}
            className="btn btn-sm btn-outline-light py-1 px-2"
            style={{ fontSize: "11px" }}
            title="Đăng xuất"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </header>

      {/* Main Tab Views */}
      <main className="flex-grow-1 p-3">
        {/* ================= TAB 1: VIỆC CỦA TÔI ================= */}
        {activeTab === "jobs" && (
          <div>
            {/* Thanh Chuyển Phạm vi & Nút Tạo ca nhanh */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              {isManager ? (
                /* Quản lý / Giám đốc: Hiển thị bộ chuyển phạm vi Toàn bộ vs Của tôi */
                <div
                  className="d-flex align-items-center gap-1 p-1 bg-light rounded-pill border shadow-xs"
                  style={{ fontSize: "12px" }}
                >
                  <button
                    type="button"
                    className={`btn btn-sm py-1 px-3 fw-bold rounded-pill transition-all ${
                      scopeFilter === "all"
                        ? "btn-primary shadow-xs"
                        : "btn-light border-0 text-muted bg-transparent"
                    }`}
                    style={{ fontSize: "11.5px" }}
                    onClick={() => setScopeFilter("all")}
                  >
                    <i className="fas fa-globe me-1"></i> Toàn bộ ({tickets.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm py-1 px-3 fw-bold rounded-pill transition-all ${
                      scopeFilter === "mine"
                        ? "btn-primary shadow-xs"
                        : "btn-light border-0 text-muted bg-transparent"
                    }`}
                    style={{ fontSize: "11.5px" }}
                    onClick={() => setScopeFilter("mine")}
                  >
                    <i className="fas fa-user-check me-1"></i> Của tôi
                  </button>
                </div>
              ) : (
                /* Kỹ thuật viên: Chỉ xem việc của mình được phân công, không cần nút chuyển phạm vi */
                <div className="d-flex align-items-center gap-1.5">
                  <span
                    className="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1.5 rounded-pill fw-semibold shadow-xs"
                    style={{ fontSize: "12px" }}
                  >
                    <i className="fas fa-clipboard-check me-1.5"></i> Việc được phân công
                  </span>
                </div>
              )}

              <button
                type="button"
                className="btn btn-warning btn-sm py-1.5 px-3 fw-bold text-dark shadow-sm d-flex align-items-center gap-1.5 rounded-pill"
                style={{ fontSize: "12px" }}
                onClick={() => setShowCameraScanner(true)}
              >
                <i className="fas fa-camera"></i> Quét máy
              </button>
            </div>

            {/* Cụm Thống kê & Bộ lọc Gộp - Vừa nhìn vừa filter, 0 trùng lặp */}
            <div className="row g-2 mb-3">
              {[
                {
                  key: "ALL",
                  label: "Tất cả",
                  icon: "fas fa-layer-group",
                  count: totalCount,
                  activeBg: "#eff6ff",
                  activeBorder: "#2563eb",
                  activeText: "#1d4ed8",
                  iconColor: "text-primary",
                },
                {
                  key: "ACTIVE_ALL",
                  label: "Cần làm",
                  icon: "fas fa-clock",
                  count: activeCount,
                  activeBg: "#f0f9ff",
                  activeBorder: "#0284c7",
                  activeText: "#0369a1",
                  iconColor: "text-info",
                },
                {
                  key: "URGENT",
                  label: "Khẩn cấp",
                  icon: "fas fa-bolt",
                  count: urgentCount,
                  activeBg: "#fff1f2",
                  activeBorder: "#e11d48",
                  activeText: "#be123c",
                  iconColor: "text-danger",
                },
                {
                  key: "COMPLETED",
                  label: "Đã xong",
                  icon: "fas fa-check-circle",
                  count: completedCount,
                  activeBg: "#f0fdf4",
                  activeBorder: "#16a34a",
                  activeText: "#15803d",
                  iconColor: "text-success",
                },
              ].map((item) => {
                const isActive = statusFilter === item.key;
                return (
                  <div key={item.key} className="col-3">
                    <button
                      type="button"
                      onClick={() => setStatusFilter(item.key)}
                      className={`w-100 rounded-3 text-center transition-all position-relative ${
                        isActive ? "shadow-sm" : "bg-white"
                      }`}
                      style={{
                        backgroundColor: isActive ? item.activeBg : "#ffffff",
                        borderColor: isActive ? item.activeBorder : "#cbd5e1",
                        borderWidth: isActive ? "2px" : "1px",
                        borderStyle: "solid",
                        padding: "8px 2px 7px 2px",
                        cursor: "pointer",
                      }}
                      title={`Lọc theo: ${item.label} (${item.count})`}
                    >
                      <div
                        className="small fw-semibold text-truncate d-flex align-items-center justify-content-center gap-1"
                        style={{
                          fontSize: "11px",
                          color: isActive ? item.activeText : "#64748b",
                        }}
                      >
                        <i className={`${item.icon} ${isActive ? "" : item.iconColor}`} style={{ fontSize: "10px" }}></i>
                        <span>{item.label}</span>
                      </div>
                      <div
                        className="fw-bold fs-5 font-monospace mt-0.5"
                        style={{
                          color: isActive ? item.activeText : "#0f172a",
                          lineHeight: 1.2,
                        }}
                      >
                        {item.count}
                      </div>
                      {isActive && (
                        <div
                          className="position-absolute bottom-0 start-50 translate-middle-x rounded-pill"
                          style={{
                            width: "20px",
                            height: "3px",
                            backgroundColor: item.activeBorder,
                            marginBottom: "-1px",
                          }}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Danh sách ticket cards */}
            {loading ? (
              <div className="py-5 text-center">
                <Loading />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-5 border rounded-3 bg-light my-3">
                <i className="fas fa-check-circle fa-2x text-success mb-2"></i>
                <div className="fw-bold">Không có phiếu kỹ thuật nào!</div>
                <div className="text-muted small">
                  {statusFilter === "URGENT"
                    ? "Không có phiếu nào ở mức khẩn cấp."
                    : statusFilter === "COMPLETED"
                    ? "Chưa có phiếu nào hoàn tất trong phạm vi này."
                    : "Không có phiếu kỹ thuật nào cần xử lý lúc này."}
                </div>
                {statusFilter !== "ACTIVE_ALL" ? (
                  <button className="btn btn-outline-primary btn-sm mt-3" onClick={() => setStatusFilter("ACTIVE_ALL")}>
                    <i className="fas fa-filter me-1"></i> Xem việc cần làm ({activeCount})
                  </button>
                ) : (
                  <button className="btn btn-outline-primary btn-sm mt-3" onClick={loadTickets}>
                    <i className="fas fa-sync-alt me-1"></i> Tải lại
                  </button>
                )}
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {filteredTickets.map((t) => {
                  const isUrgent = t.priority === "URGENT" || t.priority === "HIGH";
                  const isDone = t.status === "COMPLETED";

                  return (
                    <div
                      key={t.id}
                      className="card border-0 rounded-3 shadow-sm bg-white overflow-hidden mb-2.5 position-relative"
                      style={{
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {/* Dải màu trạng thái mảnh 3px ở đỉnh card */}
                      <div
                        style={{
                          height: "3px",
                          background: isDone
                            ? "#10b981"
                            : isUrgent
                            ? "#ef4444"
                            : t.status === "IN_PROGRESS"
                            ? "#2563eb"
                            : t.status === "WAITING_PARTS"
                            ? "#f59e0b"
                            : "#6366f1",
                        }}
                      />

                      <div className="card-body p-3">
                        {/* 1. Header tinh gọn 1 hàng: Mã phiếu, Loại phiếu & Trạng thái */}
                        <div className="d-flex justify-content-between align-items-center mb-2 gap-1 flex-nowrap">
                          <div className="d-flex align-items-center gap-1.5 min-w-0 flex-nowrap text-nowrap">
                            <span
                              className="fw-bold font-monospace text-primary flex-shrink-0"
                              style={{ fontSize: "12.5px" }}
                            >
                              #{t.code}
                            </span>
                            <span className="text-muted flex-shrink-0" style={{ fontSize: "10px" }}>•</span>
                            <span className="text-secondary small text-nowrap" style={{ fontSize: "11px" }}>
                              {TICKET_TYPE_LABELS[t.type] || t.type}
                            </span>
                            {isUrgent && !isDone && (
                              <span className="badge bg-danger text-white rounded-pill px-1.5 py-0.5 flex-shrink-0" style={{ fontSize: "9px" }}>
                                Khẩn
                              </span>
                            )}
                          </div>

                          <div className="d-flex align-items-center gap-1 flex-shrink-0 flex-nowrap text-nowrap">
                            {/* Trạng thái SLA hiển thị Date rút gọn */}
                            {t.slaDueAt && (() => {
                              const isOverdue = t.resolvedAt
                                ? new Date(t.resolvedAt).getTime() > new Date(t.slaDueAt).getTime()
                                : new Date(t.slaDueAt).getTime() < Date.now();
                              const formattedSla = formatCompactDateOnly(t.slaDueAt);
                              return (
                                <span
                                  className={`badge px-1.5 py-0.5 rounded-pill text-nowrap ${
                                    isOverdue
                                      ? "bg-danger-subtle text-danger border border-danger-subtle fw-bold"
                                      : "bg-light text-muted border"
                                  }`}
                                  style={{ fontSize: "10px" }}
                                  title={isOverdue ? `Trễ hạn SLA: ${new Date(t.slaDueAt).toLocaleString("vi-VN")}` : `Hạn SLA: ${new Date(t.slaDueAt).toLocaleString("vi-VN")}`}
                                >
                                  <i className={`far fa-clock me-1 ${isOverdue ? "text-danger" : "text-secondary"}`}></i>
                                  {formattedSla}
                                </span>
                              );
                            })()}

                            {/* Đối với ticket đã xong: Hiển thị ngày hoàn thành rút gọn */}
                            {t.resolvedAt && (
                              <span
                                className="badge bg-success-subtle text-success border border-success-subtle px-1.5 py-0.5 rounded-pill text-nowrap fw-semibold"
                                style={{ fontSize: "10px" }}
                                title={`Hoàn thành lúc: ${new Date(t.resolvedAt).toLocaleString("vi-VN")}`}
                              >
                                <i className="fas fa-check-circle me-1"></i>
                                {formatCompactDateOnly(t.resolvedAt)}
                              </span>
                            )}

                            <span
                              className={`badge rounded-pill px-2 py-0.5 fw-bold ${
                                t.status === "COMPLETED"
                                  ? "bg-success text-white"
                                  : t.status === "IN_PROGRESS"
                                  ? "bg-primary text-white"
                                  : t.status === "WAITING_PARTS"
                                  ? "bg-warning text-dark"
                                  : "bg-secondary-subtle text-secondary"
                              }`}
                              style={{ fontSize: "10.5px" }}
                            >
                              {TICKET_STATUS_LABELS[t.status] || t.status}
                            </span>
                          </div>
                        </div>

                        {/* 2. Cụm Thiết bị: Tinh gọn, hiển thị Model & SN & Vị trí */}
                        <div className="mb-2">
                          <div className="d-flex justify-content-between align-items-baseline gap-2 mb-0.5">
                            <div className="fw-bold text-dark fs-6 text-truncate">
                              {t.equipment?.brand &&
                              !t.equipment.model.toLowerCase().startsWith(t.equipment.brand.toLowerCase())
                                ? `${t.equipment.brand} ${t.equipment.model}`
                                : t.equipment?.model || "Thiết bị"}
                            </div>
                            {t.equipment?.serialNumber && (
                              <span className="badge bg-light text-muted border font-monospace flex-shrink-0" style={{ fontSize: "10.5px" }}>
                                SN: {t.equipment.serialNumber}
                              </span>
                            )}
                          </div>
                          {t.equipment?.department && (
                            <div className="text-muted small text-truncate" style={{ fontSize: "12px" }}>
                              Vị trí: <span className="text-dark">{t.equipment.department.name}</span>
                              {t.equipment.department.building?.name ? ` (${t.equipment.department.building.name})` : ""}
                            </div>
                          )}
                        </div>

                        {/* 3. Cụm Khách hàng & SĐT: Phân cách nhẹ, tên đầy đủ & nút gọi gọn */}
                        <div className="pt-2 mb-2 border-top border-light-subtle">
                          <div className="d-flex justify-content-between align-items-center gap-2 mb-0.5">
                            <div className="fw-bold text-dark text-truncate" style={{ fontSize: "13.5px" }}>
                              {t.customer?.name}
                            </div>
                            {t.customer?.phone && (
                              t.customer.phone.includes("*") ? (
                                <span
                                  className="badge bg-light text-muted border py-1 px-2 rounded-pill fw-medium text-nowrap flex-shrink-0"
                                  style={{ fontSize: "11px" }}
                                  title="Số điện thoại bị ẩn do chưa được cấp quyền xem SĐT"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <i className="fas fa-lock me-1" style={{ fontSize: "9px" }}></i>
                                  <span>{t.customer.phone}</span>
                                </span>
                              ) : (
                                <a
                                  href={`tel:${t.customer.phone}`}
                                  className="btn btn-sm btn-outline-success py-0.5 px-2 rounded-pill fw-bold text-nowrap flex-shrink-0"
                                  style={{ fontSize: "11px" }}
                                  title={`Bấm để gọi: ${t.customer.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <i className="fas fa-phone-alt me-1" style={{ fontSize: "9px" }}></i>
                                  <span>{t.customer.phone}</span>
                                </a>
                              )
                            )}
                          </div>
                          <div className="text-secondary small text-truncate" style={{ fontSize: "12px", lineHeight: "1.35" }}>
                            {t.customer?.address}
                          </div>
                        </div>

                        {/* 4. Khối Sự cố kỹ thuật: Padding rộng rãi, margin 5px so với nút dưới */}
                        {t.description && (
                          <div
                            className="rounded-2 small"
                            style={{
                              padding: "10px 14px",
                              marginBottom: "5px",
                              backgroundColor: "#fff5f5",
                              borderLeft: "3px solid #ef4444",
                              fontSize: "12.5px",
                              lineHeight: "1.45",
                            }}
                          >
                            <strong className="text-danger me-1.5">Sự cố:</strong>
                            <span className="text-dark">{t.description}</span>
                          </div>
                        )}

                        {/* 5. Cụm nút hành động cân đối 50% - 50% */}
                        <div className="row g-2 pt-0">
                          <div className="col-6">
                            <a
                              href={getDirectionsUrl(t.customer)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-outline-secondary btn-sm w-100 py-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 rounded-2 text-nowrap"
                              style={{ fontSize: "12.5px" }}
                              title="Mở chỉ đường Google Maps dẫn đến vị trí khách hàng"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <i className="fas fa-location-arrow text-danger" style={{ fontSize: "11px" }}></i>
                              <span>Chỉ đường</span>
                              {t.customer?.latitude != null && (
                                <span className="badge bg-success-subtle text-success p-0 ms-1 fw-bold" style={{ fontSize: "9px" }}>
                                  GPS
                                </span>
                              )}
                            </a>
                          </div>
                          <div className="col-6">
                            <button
                              type="button"
                              className={`btn btn-sm w-100 py-2 fw-bold d-flex align-items-center justify-content-center gap-1 rounded-2 text-nowrap ${
                                isDone
                                  ? "btn-outline-success"
                                  : t.status === "IN_PROGRESS"
                                  ? "btn-success text-white"
                                  : "btn-primary text-white"
                              }`}
                              style={{ fontSize: "12.5px" }}
                              onClick={() => openTicketAction(t)}
                            >
                              {isDone ? (
                                <span>Xem lại</span>
                              ) : t.status === "IN_PROGRESS" ? (
                                <span>Tiếp tục</span>
                              ) : (
                                <span>Bắt đầu xử lý</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: KHO & LINH KIỆN ================= */}
        {activeTab === "parts" && (
          <div>
            <h6 className="fw-bold mb-3 text-dark d-flex align-items-center justify-content-between">
              <span>
                <i className="fas fa-boxes text-primary me-2"></i>
                Vật tư &amp; Linh kiện trong kho
              </span>
              <button className="btn btn-sm btn-outline-dark py-0 px-2" onClick={loadParts}>
                <i className="fas fa-sync-alt"></i>
              </button>
            </h6>

            <div className="input-group input-group-sm mb-3">
              <span className="input-group-text bg-white">
                <i className="fas fa-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Tra cứu tên / mã linh kiện..."
                onChange={(e) => {
                  const val = e.target.value.toLowerCase();
                  if (!val) loadParts();
                  else {
                    setParts((prev) =>
                      prev.filter(
                        (p) =>
                          p.name.toLowerCase().includes(val) ||
                          p.partCode.toLowerCase().includes(val)
                      )
                    );
                  }
                }}
              />
            </div>

            <div className="d-flex flex-column gap-2">
              {parts.length === 0 ? (
                <div className="text-center py-4 text-muted small">Chưa có dữ liệu linh kiện.</div>
              ) : (
                parts.map((p) => (
                  <div key={p.id} className="p-2 border rounded-3 bg-white shadow-sm d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-bold small text-dark">{p.name}</div>
                      <div className="text-muted font-monospace" style={{ fontSize: "11px" }}>
                        Mã: <span className="text-primary">{p.partCode}</span>
                      </div>
                    </div>
                    <div className="text-end">
                      <span
                        className={`badge ${
                          p.totalQuantity > 5
                            ? "bg-success"
                            : p.totalQuantity > 0
                            ? "bg-warning text-dark"
                            : "bg-danger"
                        }`}
                        style={{ fontSize: "12px" }}
                      >
                        Tồn: {p.totalQuantity} {p.unit}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: CÁ NHÂN ================= */}
        {activeTab === "profile" && (
          <div>
            <div className="card border-0 shadow-sm rounded-3 mb-3 text-center p-3 bg-light">
              <div
                className="rounded-circle bg-primary text-white mx-auto d-flex align-items-center justify-content-center fw-bold fs-3 mb-2 shadow"
                style={{ width: "64px", height: "64px" }}
              >
                {profile?.name ? profile.name.slice(0, 2).toUpperCase() : "KT"}
              </div>
              <h5 className="fw-bold mb-1">{profile?.name}</h5>
              <div className="text-muted small mb-2">{profile?.email}</div>
              <div className="d-flex justify-content-center gap-1 flex-wrap">
                <span className="badge bg-primary px-3 py-1">
                  {profile?.role ? (ROLE_LABELS[profile.role as Role] || profile.role) : "Kỹ thuật viên"}
                </span>
                {profile?.region && (
                  <span className="badge bg-secondary px-2.5 py-1">
                    <i className="fas fa-map-marker-alt me-1"></i> {profile.region}
                  </span>
                )}
              </div>
              {profile?.phone && (
                <div className="small text-muted mt-2">
                  <i className="fas fa-phone me-1"></i> {profile.phone}
                </div>
              )}
              {profile?.skills && profile.skills.length > 0 && (
                <div className="mt-2 d-flex flex-wrap gap-1 justify-content-center">
                  {profile.skills.map((skill) => (
                    <span key={skill} className="badge bg-white text-dark border" style={{ fontSize: "11px" }}>
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="list-group mb-3 shadow-sm rounded-3">
              <div className="list-group-item d-flex justify-content-between align-items-center py-2.5">
                <span className="small text-muted">Tổng ca xử lý</span>
                <span className="fw-bold font-monospace">{tickets.length}</span>
              </div>
              <div className="list-group-item d-flex justify-content-between align-items-center py-2.5">
                <span className="small text-muted">Đã hoàn tất</span>
                <span className="fw-bold font-monospace text-success">{completedCount}</span>
              </div>
              <div className="list-group-item d-flex justify-content-between align-items-center py-2.5">
                <span className="small text-muted">Đang phụ trách</span>
                <span className="fw-bold font-monospace text-primary">{filteredTickets.length}</span>
              </div>
            </div>

            <div className="d-grid gap-2">
              {/* Card Huong dan cai dat PWA Mobile */}
            <div className="card border-0 shadow-sm rounded-3 mb-3 p-3 bg-white">
              <div className="d-flex align-items-center gap-2 mb-2 text-primary fw-bold small">
                <i className="fas fa-mobile-alt fa-lg"></i>
                <span>Cài Đặt Ứng Dụng Lên Màn Hình Chính (PWA)</span>
              </div>
              <p className="text-muted small mb-2" style={{ fontSize: "12px" }}>
                Cài đặt OfficeOps Tech ra màn hình chính điện thoại để sử dụng toàn màn hình như ứng dụng di động:
              </p>
              <div className="bg-light p-2 rounded small text-secondary" style={{ fontSize: "11px" }}>
                <div className="mb-1">
                  <strong>📱 Trên iPhone (Safari):</strong> Bấm nút <i className="fas fa-share-square text-primary"></i> Chia sẻ ở góc dưới &rarr; chọn <strong>"Thêm vào MH chính"</strong> (Add to Home Screen).
                </div>
                <div>
                  <strong>🤖 Trên Android (Chrome):</strong> Bấm dấu <i className="fas fa-ellipsis-v text-primary"></i> 3 chấm góc trên &rarr; chọn <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào Màn hình chính"</strong>.
                </div>
              </div>
            </div>

            <Link href="/" className="btn btn-outline-primary py-2 fw-semibold">
                <i className="fas fa-desktop me-2"></i> Mở Bảng điều khiển Desktop
              </Link>
              <button
                onClick={() => setShowChangePassword(true)}
                className="btn btn-outline-secondary py-2 fw-semibold"
              >
                <i className="fas fa-key me-2"></i> Đổi mật khẩu
              </button>
              <button onClick={handleLogout} className="btn btn-outline-danger py-2 fw-semibold">
                <i className="fas fa-sign-out-alt me-2"></i> Đăng xuất tài khoản
              </button>
            </div>
          </div>
        )}
      </main>

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />

      {/* ================= MODAL / DRAWER XỬ LÝ TICKET ================= */}
      {selectedTicket && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex flex-column justify-content-end align-items-center"
          style={{ zIndex: 1050 }}
        >
          <div
            className="bg-white w-100 d-flex flex-column shadow-lg"
            style={{
              height: "100dvh",
              maxHeight: "100dvh",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            {/* Header Drawer: Căn trái, căn đều trên dưới */}
            <div
              className="px-3 border-bottom d-flex align-items-center justify-content-between bg-light flex-shrink-0"
              style={{
                minHeight: "54px",
                paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
                paddingBottom: "0.75rem",
              }}
            >
              <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1 my-auto">
                <span className="badge bg-primary font-monospace flex-shrink-0" style={{ fontSize: "12px" }}>
                  {selectedTicket.code}
                </span>
                <div className="text-truncate min-w-0">
                  <span className="fw-bold text-dark small">
                    {selectedTicket.equipment?.brand &&
                    !selectedTicket.equipment?.model?.toLowerCase().startsWith(selectedTicket.equipment.brand.toLowerCase())
                      ? `${selectedTicket.equipment.brand} ${selectedTicket.equipment?.model}`
                      : selectedTicket.equipment?.model || "Thiết bị"}
                  </span>
                  {selectedTicket.equipment?.serialNumber && (
                    <span className="text-primary font-monospace small ms-1 text-nowrap">
                      ({selectedTicket.equipment.serialNumber})
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="btn-close ms-2 flex-shrink-0 my-auto"
                onClick={() => setSelectedTicket(null)}
                aria-label="Đóng"
              ></button>
            </div>

            {/* Stepper điều hướng thao tác */}
            <div className="d-flex border-bottom bg-white text-center flex-shrink-0" style={{ fontSize: "11.5px" }}>
              <button
                type="button"
                className={`flex-fill py-2 border-0 bg-transparent fw-bold ${
                  actionStep === "detail" ? "text-primary border-bottom border-2 border-primary" : "text-muted"
                }`}
                onClick={() => setActionStep("detail")}
              >
                1. Khảo sát
              </button>
              <button
                type="button"
                className={`flex-fill py-2 border-0 bg-transparent fw-bold ${
                  actionStep === "parts" ? "text-primary border-bottom border-2 border-primary" : "text-muted"
                }`}
                onClick={() => setActionStep("parts")}
              >
                2. Linh kiện
              </button>
              <button
                type="button"
                className={`flex-fill py-2 border-0 bg-transparent fw-bold ${
                  actionStep === "complete" ? "text-primary border-bottom border-2 border-primary" : "text-muted"
                }`}
                onClick={() => setActionStep("complete")}
              >
                3. Đóng phiếu kỹ thuật
              </button>
            </div>

            {/* Body Drawer */}
            <div
              className="p-3 overflow-y-auto flex-grow-1"
              style={{
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
                paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {/* Cảnh báo trạng thái phiếu đã hoàn thành */}
              {isSelectedCompleted && (
                <div
                  className={`p-2.5 rounded-3 mb-3 small d-flex align-items-center gap-2 ${
                    isSuperAdmin
                      ? "bg-info-subtle text-info-emphasis border border-info"
                      : "bg-secondary-subtle text-secondary border"
                  }`}
                >
                  <i
                    className={`fas ${
                      isSuperAdmin ? "fa-shield-alt text-primary" : "fa-lock text-secondary"
                    } fa-lg`}
                  ></i>
                  <div>
                    {isSuperAdmin ? (
                      <span>
                        <strong>Phiếu đã hoàn thành</strong> — Bạn có quyền Giám đốc (Super Admin), có thể điều chỉnh lại kết quả.
                      </span>
                    ) : (
                      <span>
                        <strong>Phiếu đã hoàn thành (Đã khóa)</strong> — Không thể sửa đổi nội dung. Chỉ Giám đốc mới có quyền chỉnh sửa.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* BƯỚC 1: KHẢO SÁT & CHECK-IN */}
              {actionStep === "detail" && (
                <div className="d-flex flex-column gap-3">
                  {/* Khối Check-in GPS */}
                  <div className="p-3 border rounded-3 bg-light">
                    <div className="d-flex justify-content-between align-items-center mb-2 flex-nowrap gap-1">
                      <strong className="small text-nowrap d-flex align-items-center flex-shrink-0">
                        <i className="fas fa-map-pin text-danger me-1"></i> Check-in GPS
                      </strong>
                      {selectedTicket.checkInAt ? (
                        <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
                          <span className="badge bg-success text-nowrap py-1 px-2" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                            <i className="fas fa-check me-1"></i> Đã check-in
                          </span>
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm py-0.5 px-2 rounded-pill fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs text-nowrap"
                            style={{ fontSize: "11px", whiteSpace: "nowrap" }}
                            onClick={handleCheckIn}
                            disabled={submitting || isSelectedLocked}
                            title="Lấy lại GPS và cập nhật lại check-in"
                          >
                            <i className={`fas fa-sync-alt ${submitting ? "fa-spin" : ""}`}></i>
                            <span>{submitting ? "Đang lấy..." : "Check lại"}</span>
                          </button>
                        </div>
                      ) : (
                        <span className="badge bg-warning text-dark text-nowrap">Chưa check-in</span>
                      )}
                    </div>
                    {selectedTicket.checkInAt ? (
                      <div className="small text-muted font-monospace">
                        Thời gian: {new Date(selectedTicket.checkInAt).toLocaleTimeString("vi-VN")}{" "}
                        {selectedTicket.checkInLat && (
                          <div>
                            Tọa độ: {selectedTicket.checkInLat.toFixed(5)},{" "}
                            {selectedTicket.checkInLng?.toFixed(5)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="small text-muted mb-2">
                          Nhấn check-in khi bạn đã có mặt tại văn phòng khách hàng.
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm w-100 fw-bold py-2"
                          onClick={handleCheckIn}
                          disabled={submitting || isSelectedLocked}
                        >
                          <i className="fas fa-crosshairs me-1"></i>
                          {submitting ? "Đang lấy GPS..." : "📍 Xác nhận đến nơi (Check-in GPS)"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Thông tin thiết bị */}
                  <div className="border rounded-3 p-3 bg-white">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        <div className="small text-muted" style={{ fontSize: "11px" }}>Thiết bị xử lý:</div>
                        <h6 className="fw-bold text-dark mb-0 fs-6">
                          {selectedTicket.equipment?.brand &&
                          !selectedTicket.equipment?.model?.toLowerCase().startsWith(selectedTicket.equipment.brand.toLowerCase())
                            ? `${selectedTicket.equipment.brand} ${selectedTicket.equipment?.model}`
                            : selectedTicket.equipment?.model || "Chưa có thiết bị"}
                        </h6>
                        {selectedTicket.equipment?.serialNumber && (
                          <span className="text-primary font-monospace small fw-semibold">
                            (SN: {selectedTicket.equipment.serialNumber})
                          </span>
                        )}
                      </div>
                      {selectedTicket.equipment?.status && (
                        <span className="badge bg-light text-dark border" style={{ fontSize: "10.5px" }}>
                          {selectedTicket.equipment.status}
                        </span>
                      )}
                    </div>

                    {selectedTicket.equipment?.department && (
                      <div className="small text-info mb-2" style={{ fontSize: "11.5px" }}>
                        <i className="fas fa-door-open me-1"></i>
                        Vị trí máy: {selectedTicket.equipment.department.name}
                        {selectedTicket.equipment.department.building?.name ? ` (${selectedTicket.equipment.department.building.name})` : ""}
                      </div>
                    )}

                    {selectedTicket.equipment?.currentCounter != null && (
                      <div className="small d-flex justify-content-between align-items-center py-1.5 px-2.5 bg-light rounded border mb-2">
                        <span className="text-secondary fw-semibold" style={{ fontSize: "11.5px" }}>
                          <i className="fas fa-tachometer-alt me-1 text-primary"></i> Counter ban đầu:
                        </span>
                        <strong className="text-primary font-monospace fs-6">
                          {selectedTicket.equipment.currentCounter.toLocaleString("vi-VN")}
                        </strong>
                      </div>
                    )}

                    {selectedTicket.description && (
                      <div className="small bg-light p-2 rounded border text-dark mb-2">
                        <span className="text-danger fw-semibold">Sự cố: </span>
                        <span>{selectedTicket.description}</span>
                      </div>
                    )}

                    <div className="small text-muted d-flex justify-content-between align-items-center mb-1" style={{ fontSize: "11px" }}>
                      <span>Tiếp nhận:</span>
                      <span className="font-monospace text-dark">
                        {formatCompactDateTime(selectedTicket.createdAt)}
                      </span>
                    </div>

                    {selectedTicket.slaDueAt && (
                      <div className="small text-muted d-flex justify-content-between align-items-center mb-1" style={{ fontSize: "11px" }}>
                        <span>Hạn xử lý SLA:</span>
                        <span
                          className={`font-monospace fw-semibold ${
                            (selectedTicket.resolvedAt
                              ? new Date(selectedTicket.resolvedAt).getTime() > new Date(selectedTicket.slaDueAt).getTime()
                              : new Date(selectedTicket.slaDueAt).getTime() < Date.now())
                              ? "text-danger"
                              : "text-dark"
                          }`}
                        >
                          {formatCompactDateTime(selectedTicket.slaDueAt)}
                        </span>
                      </div>
                    )}

                    {selectedTicket.resolvedAt && (
                      <div className="small text-success d-flex justify-content-between align-items-center fw-bold" style={{ fontSize: "11px" }}>
                        <span>Thời gian hoàn thành:</span>
                        <span className="font-monospace">
                          {formatCompactDateTime(selectedTicket.resolvedAt)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Chẩn đoán sự cố */}
                  <div>
                    <label className="form-label small fw-bold text-dark">
                      Chẩn đoán kỹ thuật / Nguyên nhân sự cố:
                    </label>
                    <textarea
                      rows={3}
                      className="form-control form-control-sm"
                      placeholder="VD: Mòn bánh xe cao su khay 1, đứt film sấy, nghẹt mực..."
                      value={diagnosis}
                      disabled={isSelectedLocked}
                      onChange={(e) => setDiagnosis(e.target.value)}
                    ></textarea>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm mt-2 w-100 fw-semibold"
                      onClick={handleUpdateDiagnosis}
                      disabled={submitting || isSelectedLocked}
                    >
                      <i className="fas fa-save me-1"></i> Lưu chẩn đoán
                    </button>
                  </div>

                  {/* Chụp & Đính kèm ảnh thực tế máy hỏng */}
                  <div className="p-2 border rounded-3 bg-white shadow-sm">
                    <div className="d-flex justify-content-between align-items-center mb-1.5">
                      <span className="small fw-bold text-dark">
                        <i className="fas fa-camera text-primary me-1"></i> Ảnh thực tế máy hỏng
                      </span>
                      {!isSelectedLocked && (
                        <div className="d-flex gap-1 align-items-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-primary py-0 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                            style={{ fontSize: "11px" }}
                            disabled={uploadingPhoto}
                            onClick={() => {
                              setTechMediaKind("PHOTO");
                              setShowTechMediaPicker(true);
                            }}
                          >
                            <i className="fas fa-photo-video"></i>
                            Media Pickup
                          </button>
                          <label className="btn btn-sm btn-outline-primary py-0 px-2 fw-semibold mb-0" style={{ fontSize: "11px" }}>
                            <i className="fas fa-camera me-1"></i>
                            {uploadingPhoto ? "..." : "Chụp nhanh"}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="d-none"
                              disabled={uploadingPhoto || isSelectedLocked}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleTechUploadPhoto(f, "PHOTO");
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {selectedTicket.attachments && selectedTicket.attachments.filter(a => a.kind === "PHOTO").length > 0 ? (
                      <div className="d-flex gap-2 overflow-auto py-1">
                        {selectedTicket.attachments.filter(a => a.kind === "PHOTO").map((att) => (
                          <div key={att.id} className="position-relative flex-shrink-0" style={{ width: "80px", height: "80px" }}>
                            <img
                              src={att.url}
                              alt="Ảnh thực tế máy hỏng"
                              className="w-100 h-100 object-fit-cover rounded border"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-muted text-center py-2" style={{ fontSize: "11px" }}>
                        Chưa có ảnh chụp sự cố. Chạm "Chụp ảnh" để lưu hình ảnh máy lỗi.
                      </div>
                    )}
                  </div>

                  <div className="d-flex gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary w-50 btn-sm"
                      onClick={() => setActionStep("parts")}
                    >
                      Tiếp theo: Linh kiện &rarr;
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary w-50 btn-sm fw-bold"
                      onClick={() => setActionStep("complete")}
                    >
                      Bỏ qua &rarr; Đóng phiếu
                    </button>
                  </div>
                </div>
              )}

              {/* BƯỚC 2: ĐỀ XUẤT LINH KIỆN */}
              {actionStep === "parts" && (
                <div>
                  <h6 className="fw-bold small mb-2 text-dark">
                    <i className="fas fa-box-open text-primary me-1"></i> Đề xuất xuất linh kiện thay thế
                  </h6>
                  <p className="text-muted" style={{ fontSize: "12px" }}>
                    Phiếu sẽ được gửi ngay cho Thủ kho hoặc Kế toán duyệt theo quy trình FIFO.
                  </p>

                  {isSelectedLocked ? (
                    <div className="alert alert-secondary py-2 px-3 small rounded mb-3">
                      <i className="fas fa-lock me-2 text-muted"></i>
                      Phiếu đã hoàn thành, không thể đề xuất xuất kho linh kiện mới.
                    </div>
                  ) : (
                    <form onSubmit={handleRequestPart} className="d-flex flex-column gap-3">
                      <div>
                        <label className="form-label small fw-bold">Chọn linh kiện cần thay (*):</label>
                        <select
                          className="form-select form-select-sm"
                          value={selectedPartId}
                          onChange={(e) => setSelectedPartId(e.target.value)}
                          required
                        >
                          <option value="">-- Chọn linh kiện trong kho --</option>
                          {parts.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.partCode}] {p.name} (Tồn: {p.totalQuantity} {p.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="form-label small fw-bold">Số lượng:</label>
                        <input
                          type="number"
                          min={1}
                          className="form-control form-control-sm"
                          value={partQty}
                          onChange={(e) => setPartQty(Number(e.target.value))}
                          required
                        />
                      </div>

                      <div>
                        <label className="form-label small fw-bold">Lý do thay thế:</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="VD: Hỏng cụm trống, cần thay gấp..."
                          value={requestReason}
                          onChange={(e) => setRequestReason(e.target.value)}
                        />
                      </div>

                      <button
                        type="submit"
                        className="btn btn-warning btn-sm fw-bold py-2 shadow-sm text-dark"
                        disabled={submittingPart}
                      >
                        <i className="fas fa-paper-plane me-1"></i>
                        {submittingPart ? "Đang gửi..." : "Gửi yêu cầu xuất kho"}
                      </button>
                    </form>
                  )}

                  <div className="mt-4 pt-3 border-top d-flex justify-content-between">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setActionStep("detail")}
                    >
                      &larr; Quay lại
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm fw-bold"
                      onClick={() => setActionStep("complete")}
                    >
                      Chuyển sang Đóng phiếu &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* BƯỚC 3: GHI COUNTER, CHỮ KÝ VÀ HOÀN TẤT */}
              {actionStep === "complete" && (
                <div className="d-flex flex-column gap-3">
                  <div className="p-2 border rounded-3 bg-light">
                    <div className="small text-muted">Counter hiện tại của máy:</div>
                    <div className="fw-bold font-monospace text-dark fs-6">
                      {selectedTicket.equipment?.currentCounter != null
                        ? `${selectedTicket.equipment.currentCounter.toLocaleString("vi-VN")} bản`
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <label className="form-label small fw-bold text-dark">
                      Chỉ số Counter chốt sau khi xử lý (*):
                    </label>
                    <input
                      type="number"
                      className="form-control form-control-sm font-monospace fw-bold fs-6"
                      value={newCounter}
                      disabled={isSelectedLocked}
                      onChange={(e) =>
                        setNewCounter(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      placeholder="Nhập số counter mới..."
                    />
                    <div className="text-muted mt-1" style={{ fontSize: "11px" }}>
                      * Chỉ số mới phải lớn hơn hoặc bằng Counter ban đầu.
                    </div>
                  </div>

                  {/* Chụp ảnh đồng hồ Counter xác thực */}
                  <div className="p-2 border rounded-3 bg-white shadow-sm">
                    <div className="d-flex justify-content-between align-items-center mb-1.5">
                      <span className="small fw-bold text-dark">
                        <i className="fas fa-camera text-warning me-1"></i> Ảnh chụp số Counter trên màn hình máy:
                      </span>
                      {!isSelectedLocked && (
                        <div className="d-flex gap-1 align-items-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-warning text-dark py-0 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                            style={{ fontSize: "11px" }}
                            disabled={uploadingPhoto}
                            onClick={() => {
                              setTechMediaKind("COUNTER_PHOTO");
                              setShowTechMediaPicker(true);
                            }}
                          >
                            <i className="fas fa-photo-video"></i>
                            Media Pickup
                          </button>
                          <label className="btn btn-sm btn-outline-warning text-dark py-0 px-2 fw-semibold mb-0" style={{ fontSize: "11px" }}>
                            <i className="fas fa-camera me-1"></i>
                            {uploadingPhoto ? "..." : "Chụp nhanh"}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="d-none"
                              disabled={uploadingPhoto || isSelectedLocked}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleTechUploadPhoto(f, "COUNTER_PHOTO");
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {selectedTicket.attachments && selectedTicket.attachments.filter(a => a.kind === "COUNTER_PHOTO").length > 0 ? (
                      <div className="d-flex gap-2 overflow-auto py-1">
                        {selectedTicket.attachments.filter(a => a.kind === "COUNTER_PHOTO").map((att) => (
                          <div key={att.id} className="position-relative flex-shrink-0" style={{ width: "90px", height: "90px" }}>
                            <img
                              src={att.url}
                              alt="Counter"
                              className="w-100 h-100 object-fit-cover rounded border border-warning"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-muted text-center py-1.5" style={{ fontSize: "11px" }}>
                        Chụp ảnh màn hình hiển thị Counter để đối chiếu chính xác.
                      </div>
                    )}
                  </div>

                  {/* Chữ ký khách hàng */}
                  <div ref={signatureRef}>
                    <label className="form-label small fw-bold text-dark d-flex justify-content-between align-items-center">
                      <span>
                        <i className="fas fa-pen-nib text-primary me-1"></i> Khách hàng ký nhận:
                      </span>
                      {!isSelectedLocked && signature && (
                        <button
                          type="button"
                          className="btn btn-link text-danger p-0 text-decoration-none small"
                          style={{ fontSize: "11px" }}
                          onClick={() => setSignature(null)}
                        >
                          Xóa chữ ký
                        </button>
                      )}
                    </label>
                    <div className="border rounded-3 p-1 bg-white shadow-sm">
                      <SignatureCanvas
                        value={signature}
                        disabled={isSelectedLocked}
                        onChange={(val) => setSignature(val)}
                      />
                    </div>
                    <div className="text-muted text-center mt-1" style={{ fontSize: "11px" }}>
                      Đưa điện thoại để khách hàng ký tên trực tiếp lên ô trên
                    </div>
                  </div>

                  <div>
                    <label className="form-label small fw-bold">Ghi chú hoàn thành:</label>
                    <textarea
                      rows={2}
                      className="form-control form-control-sm"
                      placeholder="Ghi chú thêm nếu có..."
                      value={closingNote}
                      disabled={isSelectedLocked}
                      onChange={(e) => setClosingNote(e.target.value)}
                    ></textarea>
                  </div>

                  <div className="d-grid gap-2 mt-2">
                    {isSelectedCompleted ? (
                      isSuperAdmin ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm py-2.5 fw-bold fs-6 shadow"
                          onClick={handleCompleteTicket}
                          disabled={submitting}
                        >
                          <i className="fas fa-save me-1"></i>
                          {submitting ? "Đang xử lý..." : "Cập nhật lại kết quả hoàn thành"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm py-2.5 fw-bold fs-6 shadow"
                          disabled
                        >
                          <i className="fas fa-lock me-1"></i> Phiếu đã hoàn thành (Đã khóa)
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="btn btn-success btn-sm py-2.5 fw-bold fs-6 shadow"
                        onClick={handleCompleteTicket}
                        disabled={submitting}
                      >
                        <i className="fas fa-check-double me-1"></i>
                        {submitting ? "Đang xử lý..." : "Xác nhận & Hoàn tất Phiếu kỹ thuật"}
                      </button>
                    )}
                    <a
                      href={`/tickets/${selectedTicket.id}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline-dark btn-sm py-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 shadow-2xs"
                    >
                      <i className="fas fa-print"></i>
                      <span>In phiếu kỹ thuật A4</span>
                    </a>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setActionStep("detail")}
                    >
                      &larr; Quay lại khảo sát
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL QUÉT QR / TRA CỨU THIẾT BỊ ================= */}
      {showQRModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex flex-column justify-content-end justify-content-md-center align-items-center"
          style={{ zIndex: 1060 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQRModal(false);
              setQrResult(null);
            }
          }}
        >
          <div
            className="bg-white shadow-lg w-100 overflow-hidden d-flex flex-column"
            style={{
              height: "100dvh",
              maxHeight: "100dvh",
              maxWidth: "540px",
              margin: "0 auto",
            }}
          >
            {/* Header Modal QR: Căn trái, căn đều trên dưới */}
            <div
              className="px-3 bg-dark text-white d-flex align-items-center justify-content-between flex-shrink-0"
              style={{
                minHeight: "52px",
                paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
                paddingBottom: "0.75rem",
              }}
            >
              <strong className="small my-auto d-flex align-items-center gap-1.5 text-truncate">
                <i className="fas fa-qrcode text-warning me-1"></i> Quét / Tra Cứu Thiết Bị
              </strong>

              <button
                type="button"
                className="btn-close btn-close-white ms-2 flex-shrink-0 my-auto"
                onClick={() => {
                  setShowQRModal(false);
                  setQrResult(null);
                }}
                aria-label="Đóng"
              ></button>
            </div>

            <div
              className="p-3 overflow-y-auto flex-grow-1"
              style={{
                overscrollBehavior: "contain",
                WebkitOverflowScrolling: "touch",
                paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {/* Nút bật Camera quét trực tiếp */}
              <button
                type="button"
                className="btn btn-warning w-100 fw-bold mb-3 py-2.5 shadow-sm d-flex align-items-center justify-content-center gap-2 text-dark"
                onClick={() => setShowCameraScanner(true)}
              >
                <i className="fas fa-camera fa-lg text-dark"></i>
                Bật Camera Quét Tem QR Trực Tiếp
              </button>

              <div className="d-flex align-items-center mb-3">
                <hr className="flex-grow-1 my-0 text-muted" />
                <span className="px-2 text-muted small" style={{ fontSize: "11px" }}>HOẶC NHẬP TAY</span>
                <hr className="flex-grow-1 my-0 text-muted" />
              </div>

              {/* Ô tìm kiếm mã QR / Serial */}
              <div className="input-group input-group-sm mb-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Nhập mã QR hoặc số Serial (S/N)..."
                  value={qrQuery}
                  onChange={(e) => setQrQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearchQR();
                  }}
                />
                <button
                  className="btn btn-primary fw-bold"
                  onClick={() => handleSearchQR()}
                  disabled={qrSearching}
                >
                  {qrSearching ? "Tìm..." : "Tra cứu"}
                </button>
              </div>

              {/* Kết quả tìm kiếm thiết bị */}
              {qrResult ? (
                <div className="border rounded-3 p-3 bg-light">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 className="fw-bold text-dark mb-0">
                        {qrResult.brand ? `${qrResult.brand} ` : ""}
                        {qrResult.model}
                      </h6>
                      <div className="text-primary font-monospace small">#{qrResult.serialNumber}</div>
                    </div>
                    <span className="badge bg-success">{qrResult.status}</span>
                  </div>

                  <div className="small text-muted d-flex flex-column gap-1 mb-3">
                    <div>
                      <strong className="text-dark">Khách hàng: </strong>
                      {qrResult.customer?.name || "Trong kho"}
                    </div>
                    {qrResult.customer?.phone && (
                      <div className="d-flex align-items-center gap-1">
                        <strong className="text-dark">SĐT liên hệ: </strong>
                        {qrResult.customer.phone.includes("*") ? (
                          <span className="text-muted fw-medium font-monospace d-inline-flex align-items-center gap-1" title="Số điện thoại bị ẩn do chưa được cấp quyền xem SĐT">
                            <i className="fas fa-lock small"></i>
                            <span>{qrResult.customer.phone}</span>
                          </span>
                        ) : (
                          <a
                            href={`tel:${qrResult.customer.phone}`}
                            className="text-success fw-bold text-decoration-none d-inline-flex align-items-center gap-1"
                          >
                            <i className="fas fa-phone-alt"></i>
                            <span>{qrResult.customer.phone}</span>
                          </a>
                        )}
                      </div>
                    )}
                    <div>
                      <strong className="text-dark">Địa chỉ: </strong>
                      {qrResult.customer?.address || "—"}
                    </div>
                    <div>
                      <strong className="text-dark">Vị trí: </strong>
                      {qrResult.department
                        ? `${qrResult.department.name} (${qrResult.department.building?.name || ""})`
                        : "Chưa cập nhật"}
                    </div>
                    <div>
                      <strong className="text-dark">Counter hiện tại: </strong>
                      <span className="text-primary font-monospace fw-bold">
                        {qrResult.currentCounter.toLocaleString("vi-VN")}
                      </span>
                    </div>
                  </div>

                  {/* Nút hành động nhanh */}
                  <div className="d-grid gap-2">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm fw-bold"
                      onClick={() => setShowQuickTicket(true)}
                    >
                      <i className="fas fa-tools me-1"></i> Tạo phiếu kỹ thuật cho máy này
                    </button>
                    <a
                      href={`/equipment/${qrResult.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-dark btn-sm"
                    >
                      <i className="fas fa-history me-1"></i> Xem toàn bộ lịch sử máy
                    </a>
                  </div>

                  {/* Form tạo nhanh ticket */}
                  {showQuickTicket && (
                    <form onSubmit={handleCreateQuickTicket} className="mt-3 pt-3 border-top">
                      <div className="mb-2">
                        <label className="form-label small fw-bold">Loại yêu cầu:</label>
                        <select
                          className="form-select form-select-sm"
                          value={quickTicketType}
                          onChange={(e) => setQuickTicketType(e.target.value)}
                        >
                          <option value="REPAIR">Sửa chữa sự cố</option>
                          <option value="MAINTENANCE">Bảo trì định kỳ</option>
                          <option value="INSPECTION">Kiểm tra máy</option>
                        </select>
                      </div>
                      <div className="mb-2">
                        <label className="form-label small fw-bold">Nội dung yêu cầu kỹ thuật (*):</label>
                        <textarea
                          rows={2}
                          className="form-control form-control-sm"
                          placeholder="Mô tả hiện tượng hỏng..."
                          value={quickTicketDesc}
                          onChange={(e) => setQuickTicketDesc(e.target.value)}
                          required
                        ></textarea>
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary w-50"
                          onClick={() => setShowQuickTicket(false)}
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="btn btn-sm btn-danger w-50 fw-bold"
                          disabled={submitting}
                        >
                          Tạo phiếu kỹ thuật
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 border rounded-3 border-dashed">
                  <i className="fas fa-barcode fa-2x text-muted mb-2"></i>
                  <div className="small text-muted">
                    Nhập mã định danh dán trên thân máy hoặc dán mã QR để truy xuất hồ sơ tức thì.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= BOTTOM NAVIGATION BAR (PWA) ================= */}
      <nav
        className="position-fixed bottom-0 start-50 translate-middle-x w-100 bg-white border-top d-flex justify-content-around align-items-center shadow"
        style={{
          maxWidth: "480px",
          height: "64px",
          zIndex: 1040,
        }}
      >
        {/* Tab Việc của tôi */}
        <button
          type="button"
          className={`btn border-0 p-0 d-flex flex-column align-items-center ${
            activeTab === "jobs" ? "text-primary" : "text-muted"
          }`}
          style={{ fontSize: "11px" }}
          onClick={() => setActiveTab("jobs")}
        >
          <i className="fas fa-clipboard-list fs-5 mb-0.5"></i>
          <span className="fw-semibold">Việc của tôi</span>
        </button>

        {/* Nút Nổi FAB Quét QR ở Trung Tâm - Bấm 1 chạm mở thẳng Camera */}
        <button
          type="button"
          className="btn btn-warning rounded-circle shadow-lg d-flex align-items-center justify-content-center text-dark border-3 border-white position-relative"
          style={{
            width: "56px",
            height: "56px",
            top: "-16px",
            boxShadow: "0 4px 16px rgba(255, 193, 7, 0.5)",
          }}
          onClick={() => setShowCameraScanner(true)}
          title="Bấm để mở Camera quét mã QR máy"
        >
          <i className="fas fa-qrcode fs-3 text-dark"></i>
        </button>

        {/* Tab Kho Linh kiện */}
        <button
          type="button"
          className={`btn border-0 p-0 d-flex flex-column align-items-center ${
            activeTab === "parts" ? "text-primary" : "text-muted"
          }`}
          style={{ fontSize: "11px" }}
          onClick={() => setActiveTab("parts")}
        >
          <i className="fas fa-boxes fs-5 mb-0.5"></i>
          <span className="fw-semibold">Kho linh kiện</span>
        </button>

        {/* Tab Cá nhân */}
        <button
          type="button"
          className={`btn border-0 p-0 d-flex flex-column align-items-center ${
            activeTab === "profile" ? "text-primary" : "text-muted"
          }`}
          style={{ fontSize: "11px" }}
          onClick={() => setActiveTab("profile")}
        >
          <i className="fas fa-user-circle fs-5 mb-0.5"></i>
          <span className="fw-semibold">Cá nhân</span>
        </button>
      </nav>
      {/* Component Camera Barcode / QR Scanner */}
      <CameraQRScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={(code) => {
          setShowCameraScanner(false);
          setShowQRModal(true);
          setQrQuery(code);
          handleSearchQR(code);
        }}
      />

      {/* Modal Media Pickup cho Kỹ thuật viên */}
      <FileManager
        isOpen={showTechMediaPicker}
        onClose={() => setShowTechMediaPicker(false)}
        mode="image"
        multiSelect={true}
        onSelectFiles={handleTechSelectMediaPhotos}
        onSelectFile={(url) => handleTechSelectMediaPhotos([url])}
        zIndex={1200}
        title={
          techMediaKind === "PHOTO"
            ? "Thư viện Media — Chọn ảnh thiết bị máy hỏng"
            : "Thư viện Media — Chọn ảnh chỉ số Counter"
        }
      />
    </div>
  );
}
