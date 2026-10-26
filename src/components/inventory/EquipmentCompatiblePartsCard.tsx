"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Loading from "@/components/Loading";

interface CompatiblePart {
  id: string;
  partCode: string;
  name: string;
  barcode?: string | null;
  category: string;
  categoryColor: string;
  unit: string;
  minThreshold: number;
  currentQuantity: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  salePrice: number | string | null;
  batches: {
    id: string;
    batchCode: string;
    quantity: number;
    location: string;
  }[];
}

interface CompatibleGroup {
  category: string;
  color: string;
  parts: CompatiblePart[];
}

export default function EquipmentCompatiblePartsCard({ equipmentId }: { equipmentId: string }) {
  const [groups, setGroups] = useState<CompatibleGroup[]>([]);
  const [totalParts, setTotalParts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function fetchCompatible() {
      try {
        setLoading(true);
        const res = await fetch(`/api/parts/compatible?equipmentId=${equipmentId}`);
        if (res.ok && !ignore) {
          const data = await res.json();
          setGroups(data.groups || []);
          setTotalParts(data.totalCompatibleParts || 0);
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchCompatible();
    return () => {
      ignore = true;
    };
  }, [equipmentId]);

  return (
    <div className="card shadow-sm border-0 rounded-3 mb-3">
      <div className="card-header bg-dark text-white py-2 px-3 d-flex align-items-center justify-content-between">
        <strong className="small text-uppercase">
          <i className="fas fa-boxes-stacked me-1.5 text-warning"></i>
          Vật tư &amp; Linh kiện tương thích cho máy này ({totalParts})
        </strong>
        <Link href="/inventory" className="btn btn-sm btn-outline-light py-0 px-2" style={{ fontSize: "11px" }}>
          Đến kho vật tư &rarr;
        </Link>
      </div>

      <div className="card-body p-0">
        {loading ? (
          <div className="p-4 text-center text-muted">
            <Loading />
          </div>
        ) : groups.length === 0 ? (
          <div className="p-4 text-center text-muted small">
            Chưa có thông tin vật tư tương thích cho model máy này. Bạn có thể cập nhật trong phần Quản lý Vật tư.
          </div>
        ) : (
          <div className="p-3 d-flex flex-column gap-2.5">
            {groups.map((g) => (
              <div key={g.category} className="border rounded-2 overflow-hidden bg-white">
                <div
                  className="px-2.5 py-1 text-white fw-bold d-flex align-items-center justify-content-between"
                  style={{ backgroundColor: g.color || "#0284c7", fontSize: "12px" }}
                >
                  <span>
                    <i className="fas fa-layer-group me-1"></i> {g.category}
                  </span>
                  <span className="badge bg-white text-dark" style={{ fontSize: "10px" }}>
                    {g.parts.length} loại
                  </span>
                </div>

                <table className="table table-sm table-hover mb-0 custom-dense-table">
                  <thead className="table-light" style={{ fontSize: "11px" }}>
                    <tr>
                      <th className="px-2.5" style={{ width: "130px" }}>Mã SKU</th>
                      <th>Tên vật tư</th>
                      <th className="text-center" style={{ width: "100px" }}>Tồn kho</th>
                      <th style={{ width: "160px" }}>Vị trí kho</th>
                      <th className="text-end px-2.5" style={{ width: "100px" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: "12px" }}>
                    {g.parts.map((p) => (
                      <tr key={p.id}>
                        <td className="px-2.5 font-monospace fw-bold text-dark">{p.partCode}</td>
                        <td>
                          <div className="fw-semibold text-dark">{p.name}</div>
                          {p.salePrice && (
                            <small className="text-muted font-monospace">
                              {Number(p.salePrice).toLocaleString("vi-VN")} đ/{p.unit}
                            </small>
                          )}
                        </td>
                        <td className="text-center">
                          {p.isOutOfStock ? (
                            <span className="badge bg-danger py-0.5 px-1.5" style={{ fontSize: "10px" }}>Hết hàng</span>
                          ) : p.isLowStock ? (
                            <span className="badge bg-warning text-dark py-0.5 px-1.5" style={{ fontSize: "10px" }}>
                              Còn {p.currentQuantity}
                            </span>
                          ) : (
                            <span className="badge bg-success-subtle text-success border py-0.5 px-1.5 fw-bold" style={{ fontSize: "10px" }}>
                              Còn {p.currentQuantity} {p.unit}
                            </span>
                          )}
                        </td>
                        <td className="text-muted small">
                          {p.batches.length > 0 ? (
                            <div className="text-truncate" style={{ maxWidth: "150px" }}>
                              <i className="fas fa-map-pin text-danger me-1"></i>
                              {p.batches[0].location}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-end px-2.5">
                          <Link
                            href={`/stock-issues?partId=${p.id}&equipmentId=${equipmentId}`}
                            className="btn btn-outline-primary btn-sm py-0 px-2"
                            style={{ fontSize: "11px" }}
                            title="Yêu cầu xuất linh kiện cho máy này"
                          >
                            Xuất kho
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
