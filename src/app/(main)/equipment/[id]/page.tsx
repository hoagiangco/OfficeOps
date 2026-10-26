import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatLocationPath } from "@/lib/location";
import { checkUserPermission } from "@/lib/rbacService";
import { STATUS_LABELS, TICKET_TYPE_LABELS, TICKET_STATUS_LABELS } from "@/lib/labels";
import EquipmentCompatiblePartsCard from "@/components/inventory/EquipmentCompatiblePartsCard";

const fmt = (d: Date) => d.toLocaleString("vi-VN");
const fmtDate = (d: Date) => d.toLocaleDateString("vi-VN");

export default async function EquipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !(await checkUserPermission(session.userId, session.role, "equipment:read"))) redirect("/");
  const { id } = await params;

  const e = await prisma.equipment.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          parent: {
            include: {
              parent: true,
            },
          },
        },
      },
      customer: true,
      warehouse: true,
      contract: true,
      branch: { select: { id: true, name: true } },
      building: { select: { id: true, name: true, branch: { select: { name: true } } } },
      department: { include: { building: { include: { branch: true } } } },
      statusHistory: { orderBy: { changedAt: "desc" } },
      partHistory: { include: { part: true }, orderBy: { replacedAt: "desc" } },
      tickets: { orderBy: { createdAt: "desc" }, take: 20 },
      meterLogs: { orderBy: { logDate: "desc" }, take: 15 },
    },
  });
  if (!e) notFound();

  const role = session.role;
  const showContract = role === "SUPER_ADMIN" || role === "ADMIN";
  const showLocation = true;
  const showHistory =
    role === "SUPER_ADMIN" || (await checkUserPermission(session.userId, session.role, "equipment:history"));
  const loc = formatLocationPath(e) || e.locationNote || "Chưa xác định";

  const catParts: string[] = [];
  if (e.category?.parent?.parent?.name) catParts.push(e.category.parent.parent.name);
  if (e.category?.parent?.name) catParts.push(e.category.parent.name);
  if (e.category?.name) catParts.push(e.category.name);
  const categoryPath = catParts.length > 0 ? catParts.join(" › ") : "Chưa phân danh mục";

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Link href="/equipment" className="btn btn-outline-secondary btn-sm">
            <i className="fas fa-arrow-left me-1"></i> Danh sách
          </Link>
          <div className="vr mx-1" style={{ height: "20px" }}></div>
          <h1 className="h6 mb-0 text-dark fw-bold">
            HỒ SƠ MÁY: {e.brand ? `${e.brand} ` : ""}
            {e.model} <span className="text-primary font-monospace">#{e.serialNumber}</span>
          </h1>
          {e.code && (
            <span className="badge bg-light text-secondary border font-monospace">{e.code}</span>
          )}
          {e.customer ? (
            <span className="badge bg-success">{e.relationType}</span>
          ) : (
            <span className="badge bg-light text-secondary border">Sẵn hàng</span>
          )}
          <span className="badge bg-primary">{STATUS_LABELS[e.status]}</span>
        </div>
        <div className="d-flex gap-2">
          <Link
            href={`/equipment/${e.id}/label`}
            target="_blank"
            className="btn btn-primary btn-sm px-3 fw-bold shadow-sm"
            title="In mẫu tem decal dán lên máy chuẩn bị sẵn mã QR quét báo hỏng"
          >
            <i className="fas fa-print me-1"></i> In Tem Decal Dán Máy
          </Link>
          <Link
            href={`/scan/${e.qrCode}`}
            target="_blank"
            className="btn btn-outline-dark btn-sm px-2"
            title="Xem trước trang tiếp nhận báo hỏng khi khách quét mã"
          >
            <i className="fas fa-external-link-alt me-1"></i> Thử Cổng QR
          </Link>
        </div>
      </div>

      <div className="row g-3 mb-3">
        {/* Thông tin chung */}
        <div className="col-lg-9">
          <div className="card shadow-sm border-0 rounded-3 border h-100">
            <div className="card-header bg-dark text-white py-2 px-3">
              <strong className="small text-uppercase">
                <i className="fas fa-info-circle me-1"></i> Phân loại Danh mục, Quan hệ Khách hàng &amp; Thông số Vận hành
              </strong>
            </div>
            <div className="card-body p-3">
              <div className="row g-2 small">
                <div className="col-md-6">
                  <div className="p-2 bg-light rounded border h-100">
                    <div className="text-muted">Khách hàng &amp; Hình thức quan hệ:</div>
                    <div className="d-flex align-items-center gap-2 mt-0.5 flex-wrap">
                      {e.customer ? (
                        <>
                          <span className="fw-bold text-dark fs-6">
                            {e.customer.name}
                          </span>
                          <span className="badge bg-primary">{e.relationType}</span>
                        </>
                      ) : (
                        <>
                          <span className="badge bg-warning-subtle text-dark border border-warning fs-6">
                            <i className="fas fa-warehouse text-warning me-1"></i>
                            {e.warehouse?.name || "Kho công ty"}
                          </span>
                          <span className="badge bg-light text-secondary border">Sẵn hàng</span>
                          <span className="badge bg-secondary">{STATUS_LABELS[e.status]}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-2 bg-light rounded border h-100">
                    <div className="text-muted">Counter hiện tại:</div>
                    <div className="fw-bold text-primary font-monospace fs-6">
                      {e.currentCounter.toLocaleString("vi-VN")} bản
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-2 border rounded">
                    <span className="text-muted">Danh mục đa cấp: </span>
                    <strong className="text-dark">
                      <i className="fas fa-sitemap text-warning me-1"></i>
                      {categoryPath}
                    </strong>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-2 border rounded">
                    <span className="text-muted">Hãng • Loại • Nhóm: </span>
                    <strong className="text-dark">
                      {e.brand || "—"} • {e.type} • {e.group}
                    </strong>
                  </div>
                </div>

                {showLocation && (
                  <div className="col-md-6">
                    <div className="p-2 border rounded">
                      <span className="text-muted">
                        {e.customer ? "Vị trí lắp đặt: " : "Kho lưu trữ công ty: "}
                      </span>
                      {e.customer ? (
                        <strong>{loc}</strong>
                      ) : (
                        <strong className="text-dark">
                          {e.warehouse?.name || "Kho công ty"}
                          {e.locationNote ? ` • ${e.locationNote}` : ""}
                        </strong>
                      )}
                    </div>
                  </div>
                )}
                <div className="col-md-6">
                  <div className="p-2 border rounded">
                    <span className="text-muted">Chỉ số sức khỏe máy: </span>
                    <strong className="text-success">{e.healthScore}%</strong>
                  </div>
                </div>
                {showContract && (
                  <>
                    <div className="col-md-6">
                      <div className="p-2 border rounded">
                        <span className="text-muted">Mã hợp đồng: </span>
                        <strong className="font-monospace">{e.contract?.code ?? "—"}</strong>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="p-2 border rounded">
                        <span className="text-muted">Định mức bản in riêng: </span>
                        <strong>
                          {e.baseQuota !== null
                            ? `${e.baseQuota.toLocaleString("vi-VN")} bản/tháng`
                            : `Theo hợp đồng (${e.contract?.baseQuota?.toLocaleString("vi-VN") ?? "—"})`}
                        </strong>
                      </div>
                    </div>
                  </>
                )}
                <div className="col-md-4">
                  <div className="p-2 border rounded">
                    <span className="text-muted">Ngày nhập kho: </span>
                    <strong>{e.importedAt ? fmtDate(e.importedAt) : "—"}</strong>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-2 border rounded">
                    <span className="text-muted">Ngày lắp đặt: </span>
                    <strong>{e.installedAt ? fmtDate(e.installedAt) : "—"}</strong>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-2 border rounded">
                    <span className="text-muted">Hạn bảo hành / bảo trì: </span>
                    <strong>{e.warrantyUntil ? fmtDate(e.warrantyUntil) : "—"}</strong>
                  </div>
                </div>
                {e.notes && (
                  <div className="col-12">
                    <div className="p-2 border rounded bg-light">
                      <span className="text-muted">Ghi chú kỹ thuật / dịch vụ: </span>
                      <strong>{e.notes}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mã định danh QR */}
        <div className="col-lg-3">
          <div className="card shadow-sm border-0 rounded-3 border h-100 text-center">
            <div className="card-header bg-dark text-white py-2 px-3">
              <strong className="small text-uppercase">Mã Định Danh QR</strong>
            </div>
            <div className="card-body d-flex flex-column align-items-center justify-content-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/equipment/${e.id}/qr`}
                alt="QR thiết bị"
                width={165}
                height={165}
                className="border rounded p-1 bg-white"
              />
              <div className="mt-2 small font-monospace text-muted text-break">{e.qrCode}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Vật tư & Linh kiện tương thích */}
      <EquipmentCompatiblePartsCard equipmentId={e.id} />

      {showHistory && (
        <div className="row g-3 mb-3">
          {/* Lịch sử sửa chữa */}
          <div className="col-lg-6">
            <div className="card shadow-sm border-0 rounded-3 border h-100">
              <div className="card-header bg-dark text-white py-2 px-3">
                <strong className="small text-uppercase">
                  <i className="fas fa-tools me-1"></i> Lịch sử sửa chữa &amp; Bảo trì ({e.tickets.length})
                </strong>
              </div>
              <div className="card-body p-0">
                <table className="table table-sm table-hover mb-0 custom-dense-table">
                  <thead className="table-light">
                    <tr>
                      <th className="px-3">Mã phiếu</th>
                      <th>Loại</th>
                      <th>Trạng thái</th>
                      <th>Mô tả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.tickets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-muted small">
                          Chưa phát sinh phiếu kỹ thuật nào
                        </td>
                      </tr>
                    ) : (
                      e.tickets.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 font-monospace fw-bold small">{t.code}</td>
                          <td className="small">{TICKET_TYPE_LABELS[t.type] || t.type}</td>
                          <td>
                            <span className="badge bg-secondary">
                              {TICKET_STATUS_LABELS[t.status] || t.status}
                            </span>
                          </td>
                          <td className="small text-truncate" style={{ maxWidth: "200px" }}>
                            {t.description}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Linh kiện đã thay */}
          <div className="col-lg-6">
            <div className="card shadow-sm border-0 rounded-3 border h-100">
              <div className="card-header bg-dark text-white py-2 px-3">
                <strong className="small text-uppercase">
                  <i className="fas fa-cogs me-1"></i> Linh kiện đã thay thế ({e.partHistory.length})
                </strong>
              </div>
              <div className="card-body p-0">
                <table className="table table-sm table-hover mb-0 custom-dense-table">
                  <thead className="table-light">
                    <tr>
                      <th className="px-3">Thời gian</th>
                      <th>Mã &amp; Tên linh kiện</th>
                      <th className="text-center">SL</th>
                      <th className="text-center">Thu hồi xác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.partHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-muted small">
                          Chưa thay thế linh kiện nào
                        </td>
                      </tr>
                    ) : (
                      e.partHistory.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 small text-muted">{fmt(p.replacedAt)}</td>
                          <td className="small">
                            <strong>{p.part.name}</strong> ({p.part.partCode})
                          </td>
                          <td className="text-center fw-bold small">{p.quantity}</td>
                          <td className="text-center small">
                            {p.oldPartReturned ? (
                              <span className="text-success">Đã thu hồi</span>
                            ) : (
                              <span className="text-muted">Chưa</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lịch sử trạng thái */}
      <div className="card shadow-sm border-0 rounded-3 border">
        <div className="card-header bg-dark text-white py-2 px-3">
          <strong className="small text-uppercase">
            <i className="fas fa-history me-1"></i> Lịch sử biến động trạng thái vòng đời
          </strong>
        </div>
        <div className="card-body p-0">
          <table className="table table-sm mb-0 custom-dense-table">
            <thead className="table-light">
              <tr>
                <th className="px-3" style={{ width: "180px" }}>
                  Thời điểm
                </th>
                <th>Chuyển đổi trạng thái</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {e.statusHistory.map((h) => (
                <tr key={h.id}>
                  <td className="px-3 small text-muted font-monospace">{fmt(h.changedAt)}</td>
                  <td className="small">
                    {h.fromStatus ? (
                      <>
                        <span className="badge bg-secondary me-1">
                          {STATUS_LABELS[h.fromStatus]}
                        </span>
                        <i className="fas fa-arrow-right text-muted mx-1"></i>
                      </>
                    ) : null}
                    <span className="badge bg-primary">{STATUS_LABELS[h.toStatus]}</span>
                  </td>
                  <td className="small text-muted">{h.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
