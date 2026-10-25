"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  calculateDistanceKm,
  estimateCoordinatesFromAddress,
} from "@/lib/location";
import { TICKET_PRIORITY_LABELS } from "@/lib/labels";

export interface MapTicket {
  id: string;
  code: string;
  type: string;
  status: string;
  priority: string;
  description: string;
  slaDueAt: string | null;
  assigneeId: string | null;
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
    model: string;
    brand: string | null;
    serialNumber: string;
    branch?: { latitude?: number | null; longitude?: number | null } | null;
  };
  assignee?: { id: string; name: string } | null;
}

export interface MapTechnician {
  id: string;
  name: string;
  phone: string | null;
  region: string | null;
  skills: string[];
  openTicketsCount: number;
  lastLocation?: {
    latitude: number;
    longitude: number;
    checkInAt: string;
    ticketCode?: string;
    customerName?: string;
  } | null;
}

interface DispatchMapProps {
  tickets: MapTicket[];
  technicians: MapTechnician[];
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
  onAssignTicket: (ticketId: string, techId: string, techName: string) => void;
  onViewTicketDetail?: (ticketId: string) => void;
  height?: string;
}

export function DispatchMap({
  tickets,
  technicians,
  selectedTicketId,
  onSelectTicket,
  onAssignTicket,
  onViewTicketDetail,
  height = "520px",
}: DispatchMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapMode, setMapMode] = useState<"street" | "satellite">("street");
  const streetLayerRef = useRef<any>(null);
  const satLayerRef = useRef<any>(null);

  // Layer groups để quản lý xóa/vẽ lại marker
  const ticketMarkersLayerRef = useRef<any>(null);
  const techMarkersLayerRef = useRef<any>(null);
  const polylineLayerRef = useRef<any>(null);

  // 1. Tải Leaflet CDN
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setLeafletReady(true);
      return;
    }

    // Nạp CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Nạp JS
    if (!document.getElementById("leaflet-js")) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.onload = () => setLeafletReady(true);
      document.body.appendChild(script);
    } else {
      setLeafletReady(true);
    }
  }, []);

  // 2. Chuẩn hóa vị trí của từng phiếu sự cố
  const geocodedTickets = useMemo(() => {
    return tickets.map((t) => {
      let lat = t.customer.latitude ?? t.equipment.branch?.latitude;
      let lng = t.customer.longitude ?? t.equipment.branch?.longitude;
      let isEstimated = false;

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        const est = estimateCoordinatesFromAddress(t.customer.address, t.id);
        lat = est.latitude;
        lng = est.longitude;
        isEstimated = true;
      }

      return {
        ...t,
        lat: Number(lat),
        lng: Number(lng),
        isEstimated,
      };
    });
  }, [tickets]);

  // 3. Chuẩn hóa vị trí của từng Kỹ thuật viên
  const geocodedTechs = useMemo(() => {
    return technicians.map((tech) => {
      let lat = tech.lastLocation?.latitude;
      let lng = tech.lastLocation?.longitude;
      let isEstimated = false;

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        const est = estimateCoordinatesFromAddress(tech.region || "Quận 1", tech.id);
        lat = est.latitude;
        lng = est.longitude;
        isEstimated = true;
      }

      return {
        ...tech,
        lat: Number(lat),
        lng: Number(lng),
        isEstimated,
      };
    });
  }, [technicians]);

  // Phiếu đang được chọn
  const currentSelectedTicket = useMemo(() => {
    return geocodedTickets.find((t) => t.id === selectedTicketId) || null;
  }, [geocodedTickets, selectedTicketId]);

  // 4. Khởi tạo bản đồ
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const defaultCenter = [10.7769, 106.7009]; // TP.HCM
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: true,
    });

    // Lớp Bản đồ đường phố (OpenStreetMap)
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    });
    streetLayerRef.current = street;

    // Lớp Vệ tinh ESRI
    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "&copy; Esri World Imagery",
        maxZoom: 19,
      }
    );
    satLayerRef.current = sat;

    // Mặc định nạp street
    street.addTo(map);

    // Khởi tạo các layer group
    ticketMarkersLayerRef.current = L.layerGroup().addTo(map);
    techMarkersLayerRef.current = L.layerGroup().addTo(map);
    polylineLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletReady]);

  // 5. Chuyển đổi chế độ Street / Satellite
  useEffect(() => {
    if (!mapInstanceRef.current || !streetLayerRef.current || !satLayerRef.current) return;
    const map = mapInstanceRef.current;
    if (mapMode === "street") {
      map.removeLayer(satLayerRef.current);
      streetLayerRef.current.addTo(map);
    } else {
      map.removeLayer(streetLayerRef.current);
      satLayerRef.current.addTo(map);
    }
  }, [mapMode]);

  // 6. Vẽ Markers phiếu kỹ thuật & KTV
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady) return;
    const L = (window as any).L;
    if (!L) return;

    const map = mapInstanceRef.current;
    const ticketGroup = ticketMarkersLayerRef.current;
    const techGroup = techMarkersLayerRef.current;
    const polylineGroup = polylineLayerRef.current;

    if (!ticketGroup || !techGroup || !polylineGroup) return;

    ticketGroup.clearLayers();
    techGroup.clearLayers();
    polylineGroup.clearLayers();

    const allLatLngs: [number, number][] = [];

    // Helper tạo Icon Ticket HTML
    const createTicketIcon = (ticket: (typeof geocodedTickets)[0], isSelected: boolean) => {
      let bg = "#0284c7"; // Normal
      let pulseClass = "";
      if (ticket.priority === "URGENT") {
        bg = "#ef4444";
        pulseClass = "dispatch-pulse-urgent";
      } else if (ticket.priority === "HIGH") {
        bg = "#f97316";
      } else if (ticket.priority === "LOW") {
        bg = "#64748b";
      }

      const isAssigned = !!ticket.assigneeId;

      const html = `
        <div class="dispatch-marker-container ${pulseClass}" style="position: relative; cursor: pointer;">
          <div style="
            width: ${isSelected ? "34px" : "28px"};
            height: ${isSelected ? "34px" : "28px"};
            background: ${bg};
            border: ${isSelected ? "3px solid #ffffff" : "2px solid #ffffff"};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: ${isSelected ? "13px" : "11px"};
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            font-weight: bold;
          ">
            <i class="fas ${ticket.priority === "URGENT" ? "fa-bolt" : "fa-tools"}"></i>
          </div>
          ${
            isAssigned
              ? `<div style="
                  position: absolute;
                  bottom: -2px;
                  right: -2px;
                  background: #10b981;
                  color: white;
                  width: 14px;
                  height: 14px;
                  border-radius: 50%;
                  border: 2px solid white;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 8px;
                "><i class="fas fa-check"></i></div>`
              : ""
          }
        </div>
      `;

      return L.divIcon({
        className: "custom-dispatch-icon",
        html,
        iconSize: [isSelected ? 34 : 28, isSelected ? 34 : 28],
        iconAnchor: [isSelected ? 17 : 14, isSelected ? 17 : 14],
        popupAnchor: [0, -18],
      });
    };

    // Helper tạo Icon Kỹ thuật viên
    const createTechIcon = (tech: (typeof geocodedTechs)[0]) => {
      const isIdle = tech.openTicketsCount === 0;
      const bg = isIdle ? "#10b981" : tech.openTicketsCount <= 2 ? "#f59e0b" : "#ef4444";

      const html = `
        <div style="text-align: center; cursor: pointer;">
          <div style="
            width: 30px;
            height: 30px;
            background: ${bg};
            border: 2px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 13px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            margin: 0 auto;
          ">
            <i class="fas fa-motorcycle"></i>
          </div>
          <div style="
            background: rgba(15, 23, 42, 0.85);
            color: #ffffff;
            font-size: 10px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: 8px;
            white-space: nowrap;
            margin-top: 2px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          ">
            ${tech.name.split(" ").slice(-2).join(" ")}
          </div>
        </div>
      `;

      return L.divIcon({
        className: "custom-tech-icon",
        html,
        iconSize: [60, 48],
        iconAnchor: [30, 15],
        popupAnchor: [0, -20],
      });
    };

    // 6.1 Vẽ Kỹ thuật viên
    geocodedTechs.forEach((tech) => {
      allLatLngs.push([tech.lat, tech.lng]);
      const marker = L.marker([tech.lat, tech.lng], {
        icon: createTechIcon(tech),
        zIndexOffset: 100,
      });

      const popupContent = `
        <div style="min-width: 200px; font-family: inherit; font-size: 12px; line-height: 1.4;">
          <div style="font-weight: 700; color: #0f172a; font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <i class="fas fa-user-shield text-primary"></i> ${tech.name}
          </div>
          <div style="color: #64748b; margin-bottom: 2px;">
            <i class="fas fa-phone-alt me-1"></i> ${tech.phone || "Chưa có SĐT"}
          </div>
          <div style="color: #64748b; margin-bottom: 4px;">
            <i class="fas fa-map-marker-alt me-1 text-danger"></i> Tuyến: <strong>${tech.region || "Toàn TP"}</strong>
          </div>
          <div style="margin-bottom: 6px;">
            <span style="background: ${tech.openTicketsCount === 0 ? "#d1fae5" : "#fef3c7"}; color: ${tech.openTicketsCount === 0 ? "#065f46" : "#92400e"}; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px;">
              ${tech.openTicketsCount === 0 ? "Đang rảnh (0 phiếu)" : `Đang xử lý ${tech.openTicketsCount} phiếu`}
            </span>
          </div>
          ${
            tech.lastLocation
              ? `<div style="font-size: 11px; color: #475569; background: #f8fafc; padding: 4px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 6px;">
                  Check-in gần nhất: <strong>${new Date(tech.lastLocation.checkInAt).toLocaleTimeString("vi-VN")}</strong><br/>
                  Tại: ${tech.lastLocation.customerName || "Khách hàng"}
                </div>`
              : `<div style="font-size: 10px; color: #94a3b8; font-style: italic; margin-bottom: 6px;">Vị trí ước tính theo khu vực</div>`
          }
          ${
            currentSelectedTicket && currentSelectedTicket.assigneeId !== tech.id
              ? `<button id="btn-assign-tech-${tech.id}" style="width: 100%; padding: 5px 8px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 11px;">
                  Giao phiếu ${currentSelectedTicket.code} cho KTV này
                </button>`
              : ""
          }
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on("popupopen", () => {
        const btn = document.getElementById(`btn-assign-tech-${tech.id}`);
        if (btn && currentSelectedTicket) {
          btn.onclick = () => onAssignTicket(currentSelectedTicket.id, tech.id, tech.name);
        }
      });

      techGroup.addLayer(marker);
    });

    // 6.2 Vẽ Phiếu kỹ thuật
    geocodedTickets.forEach((ticket) => {
      const isSelected = ticket.id === selectedTicketId;
      allLatLngs.push([ticket.lat, ticket.lng]);

      const marker = L.marker([ticket.lat, ticket.lng], {
        icon: createTicketIcon(ticket, isSelected),
        zIndexOffset: isSelected ? 500 : 200,
      });

      // Tính khoảng cách tới KTV gần nhất
      const rankedTechDistances = geocodedTechs
        .map((t) => ({
          tech: t,
          distKm: calculateDistanceKm(ticket.lat, ticket.lng, t.lat, t.lng),
        }))
        .sort((a, b) => a.distKm - b.distKm);

      const nearest = rankedTechDistances[0];

      const popupContent = `
        <div style="min-width: 220px; font-family: inherit; font-size: 12px; line-height: 1.4;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #0284c7; font-size: 13px;">${ticket.code}</strong>
            <span style="font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: bold; background: ${
              ticket.priority === "URGENT" ? "#fee2e2; color: #b91c1c" : "#f1f5f9; color: #334155"
            }">
              ${TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}
            </span>
          </div>

          <div style="font-weight: 600; color: #0f172a; margin-bottom: 2px;">
            ${ticket.customer.name}
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 4px;">
            <i class="fas fa-map-marker-alt text-danger me-1"></i> ${ticket.customer.address}
          </div>
          <div style="color: #475569; font-size: 11px; margin-bottom: 6px;">
            Máy: <strong>${ticket.equipment.model}</strong> (${ticket.equipment.serialNumber})
          </div>

          ${
            ticket.assignee
              ? `<div style="background: #ecfdf5; color: #065f46; padding: 4px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 6px;">
                  <i class="fas fa-user-check me-1"></i> Đang phụ trách: ${ticket.assignee.name}
                </div>`
              : `<div style="background: #fffbeb; color: #92400e; padding: 4px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 6px;">
                  <i class="fas fa-exclamation-circle me-1"></i> Chưa phân công KTV
                </div>`
          }

          ${
            nearest
              ? `<div style="font-size: 11px; color: #0369a1; background: #e0f2fe; padding: 4px 6px; border-radius: 4px; margin-bottom: 6px;">
                  <i class="fas fa-route me-1"></i> KTV gần nhất: <strong>${nearest.tech.name}</strong> (${nearest.distKm} km)
                </div>`
              : ""
          }

          <div style="display: flex; gap: 4px; margin-top: 6px;">
            <button id="btn-select-map-${ticket.id}" style="flex: 1; padding: 4px 6px; background: #0f172a; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
              Xem KTV gợi ý
            </button>
            ${
              nearest && !ticket.assigneeId
                ? `<button id="btn-quick-assign-${ticket.id}" style="flex: 1; padding: 4px 6px; background: #10b981; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
                    Giao cho KTV gần nhất
                  </button>`
                : ""
            }
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on("click", () => {
        onSelectTicket(ticket.id);
      });

      marker.on("popupopen", () => {
        const btnSelect = document.getElementById(`btn-select-map-${ticket.id}`);
        if (btnSelect) {
          btnSelect.onclick = () => onSelectTicket(ticket.id);
        }
        const btnQuick = document.getElementById(`btn-quick-assign-${ticket.id}`);
        if (btnQuick && nearest) {
          btnQuick.onclick = () => onAssignTicket(ticket.id, nearest.tech.id, nearest.tech.name);
        }
      });

      ticketGroup.addLayer(marker);
    });

    // 6.3 Vẽ Polyline nét đứt nối phiếu đang chọn tới KTV phụ trách / KTV gần nhất
    if (currentSelectedTicket) {
      // Ưu tiên KTV đang được giao, nếu chưa giao thì lấy KTV gần nhất
      let targetTech = geocodedTechs.find((t) => t.id === currentSelectedTicket.assigneeId);
      if (!targetTech && geocodedTechs.length > 0) {
        // Tìm KTV gần nhất
        const sorted = [...geocodedTechs].sort((a, b) => {
          const dA = calculateDistanceKm(currentSelectedTicket.lat, currentSelectedTicket.lng, a.lat, a.lng);
          const dB = calculateDistanceKm(currentSelectedTicket.lat, currentSelectedTicket.lng, b.lat, b.lng);
          return dA - dB;
        });
        targetTech = sorted[0];
      }

      if (targetTech) {
        const dist = calculateDistanceKm(
          currentSelectedTicket.lat,
          currentSelectedTicket.lng,
          targetTech.lat,
          targetTech.lng
        );

        const latlngs: [number, number][] = [
          [currentSelectedTicket.lat, currentSelectedTicket.lng],
          [targetTech.lat, targetTech.lng],
        ];

        const polyline = L.polyline(latlngs, {
          color: currentSelectedTicket.assigneeId ? "#10b981" : "#0284c7",
          weight: 3,
          opacity: 0.8,
          dashArray: "6, 8",
        });

        polyline.bindTooltip(
          `🚗 ${targetTech.name} &rarr; ${currentSelectedTicket.code} (${dist} km)`,
          {
            permanent: true,
            direction: "center",
            className: "dispatch-distance-tooltip",
          }
        );

        polylineGroup.addLayer(polyline);
      }
    }
  }, [geocodedTickets, geocodedTechs, selectedTicketId, currentSelectedTicket, leafletReady]);

  // 7. Focus vào phiếu đang chọn khi thay đổi từ danh sách ngoài
  useEffect(() => {
    if (!mapInstanceRef.current || !currentSelectedTicket) return;
    mapInstanceRef.current.flyTo(
      [currentSelectedTicket.lat, currentSelectedTicket.lng],
      15,
      { animate: true, duration: 0.8 }
    );
  }, [selectedTicketId]);

  // Nút Fit toàn cảnh
  const handleFitAll = () => {
    if (!mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const allPts: [number, number][] = [
      ...geocodedTickets.map((t): [number, number] => [t.lat, t.lng]),
      ...geocodedTechs.map((t): [number, number] => [t.lat, t.lng]),
    ];

    if (allPts.length > 0) {
      const bounds = L.latLngBounds(allPts);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  return (
    <div className="position-relative rounded-3 overflow-hidden border shadow-sm bg-light">
      {/* CSS Animations & Custom Tooltip */}
      <style>{`
        @keyframes dispatchPulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .dispatch-pulse-urgent {
          animation: dispatchPulse 1.8s infinite;
          border-radius: 50%;
        }
        .dispatch-distance-tooltip {
          background: rgba(15, 23, 42, 0.85) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 6px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          padding: 2px 8px !important;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important;
        }
      `}</style>

      {/* Floating Map Controls */}
      <div
        className="position-absolute top-2 end-2 d-flex gap-1 z-3 shadow-sm p-1 bg-white rounded-3 border"
        style={{ zIndex: 1000 }}
      >
        <button
          type="button"
          className={`btn btn-xs py-1 px-2 fw-semibold ${
            mapMode === "street" ? "btn-primary text-white" : "btn-light text-dark"
          }`}
          style={{ fontSize: "11px" }}
          onClick={() => setMapMode("street")}
          title="Chế độ Đường phố"
        >
          <i className="fas fa-map me-1"></i> Đường phố
        </button>
        <button
          type="button"
          className={`btn btn-xs py-1 px-2 fw-semibold ${
            mapMode === "satellite" ? "btn-primary text-white" : "btn-light text-dark"
          }`}
          style={{ fontSize: "11px" }}
          onClick={() => setMapMode("satellite")}
          title="Chế độ Ảnh vệ tinh"
        >
          <i className="fas fa-satellite me-1"></i> Vệ tinh
        </button>
        <button
          type="button"
          className="btn btn-xs btn-outline-secondary py-1 px-2 fw-semibold"
          style={{ fontSize: "11px" }}
          onClick={handleFitAll}
          title="Thu phóng xem toàn cảnh tất cả phiếu & KTV"
        >
          <i className="fas fa-expand-arrows-alt me-1"></i> Toàn cảnh
        </button>
      </div>

      {/* Map Legend (Chú thích) */}
      <div
        className="position-absolute bottom-2 start-2 bg-white p-2 rounded-3 border shadow-sm z-3 small"
        style={{ zIndex: 1000, maxWidth: "260px", fontSize: "11px", opacity: 0.95 }}
      >
        <div className="fw-bold text-dark mb-1 d-flex align-items-center gap-1">
          <i className="fas fa-info-circle text-primary"></i> Chú thích bản đồ:
        </div>
        <div className="d-flex flex-wrap gap-2 text-muted">
          <span className="d-flex align-items-center gap-1">
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            Khẩn cấp
          </span>
          <span className="d-flex align-items-center gap-1">
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />
            Cao
          </span>
          <span className="d-flex align-items-center gap-1">
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#0284c7", display: "inline-block" }} />
            Thường
          </span>
          <span className="d-flex align-items-center gap-1">
            <i className="fas fa-motorcycle text-success"></i> KTV rảnh
          </span>
          <span className="d-flex align-items-center gap-1">
            <i className="fas fa-motorcycle text-warning"></i> KTV đang có ca
          </span>
        </div>
      </div>

      {/* Map View Canvas */}
      <div ref={mapContainerRef} style={{ width: "100%", height }} />
    </div>
  );
}
