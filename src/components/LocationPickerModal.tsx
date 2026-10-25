"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import { parseCoordinates } from "@/lib/location";

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLng?: number | null;
  initialAddress?: string | null;
  onConfirm: (data: { latitude: number; longitude: number; address?: string }) => void;
}

// Tọa độ mặc định tại Kiên Giang / Rạch Giá nếu chưa có tọa độ
const DEFAULT_LAT = 10.0125;
const DEFAULT_LNG = 105.0809;

export default function LocationPickerModal({
  isOpen,
  onClose,
  initialLat,
  initialLng,
  initialAddress,
  onConfirm,
}: LocationPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat && !isNaN(Number(initialLat)) ? Number(initialLat) : DEFAULT_LAT,
    lng: initialLng && !isNaN(Number(initialLng)) ? Number(initialLng) : DEFAULT_LNG,
  });

  const [mapType, setMapType] = useState<"street" | "satellite">("satellite");
  const [streetLayer, setStreetLayer] = useState<any>(null);
  const [satelliteLayer, setSatelliteLayer] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState(initialAddress || "");
  const [searching, setSearching] = useState(false);
  const [pasteInput, setPasteInput] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // 1. Tải Leaflet CDN khi mở modal nếu chưa có
  useEffect(() => {
    if (!isOpen) return;

    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    // Nạp CSS Leaflet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Nạp JS Leaflet
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      setLeafletLoaded(true);
    };
    script.onerror = () => {
      toast.error("Không thể tải thư viện bản đồ vệ tinh.");
    };
    document.body.appendChild(script);

    return () => {
      // Dọn dẹp nếu cần
    };
  }, [isOpen]);

  // 2. Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!isOpen || !leafletLoaded || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Hủy instance cũ nếu có
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const startLat = initialLat && !isNaN(Number(initialLat)) ? Number(initialLat) : DEFAULT_LAT;
    const startLng = initialLng && !isNaN(Number(initialLng)) ? Number(initialLng) : DEFAULT_LNG;

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: initialLat && initialLng ? 18 : 14,
      zoomControl: true,
    });

    // Lớp Bản đồ đường phố (OpenStreetMap)
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    });

    // Lớp Ảnh vệ tinh (ESRI World Imagery - Siêu nét, nhìn rõ mái nhà)
    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19,
      }
    );

    // Mặc định chọn vệ tinh
    sat.addTo(map);
    setStreetLayer(street);
    setSatelliteLayer(sat);
    mapInstanceRef.current = map;

    // Tạo Icon Marker SVG màu đỏ không phụ thuộc file ảnh ngoài
    const customIcon = L.divIcon({
      className: "custom-map-marker",
      html: `
        <div style="transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); cursor: grab;">
          <div style="background-color: #ef4444; color: white; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid #ffffff;">
            <i class="fas fa-crosshairs" style="transform: rotate(45deg); font-size: 15px;"></i>
          </div>
          <div style="width: 10px; height: 4px; background: rgba(0,0,0,0.3); border-radius: 50%; margin-top: 2px;"></div>
        </div>
      `,
      iconSize: [34, 42],
      iconAnchor: [17, 42],
    });

    const marker = L.marker([startLat, startLng], {
      draggable: true,
      icon: customIcon,
    }).addTo(map);

    markerRef.current = marker;
    setCoords({ lat: startLat, lng: startLng });

    // Sự kiện kéo ghim
    marker.on("dragend", (e: any) => {
      const position = e.target.getLatLng();
      const newLat = Number(position.lat.toFixed(6));
      const newLng = Number(position.lng.toFixed(6));
      setCoords({ lat: newLat, lng: newLng });
    });

    // Sự kiện nhấp bản đồ để đổi vị trí ghim
    map.on("click", (e: any) => {
      const newLat = Number(e.latlng.lat.toFixed(6));
      const newLng = Number(e.latlng.lng.toFixed(6));
      marker.setLatLng([newLat, newLng]);
      setCoords({ lat: newLat, lng: newLng });
    });

    // Ép bản đồ tự tính toán lại kích thước sau khi render xong modal
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, leafletLoaded]);

  // Đổi kiểu hiển thị bản đồ (Vệ tinh vs Đường phố)
  const toggleMapLayer = (type: "street" | "satellite") => {
    if (!mapInstanceRef.current || !streetLayer || !satelliteLayer) return;
    setMapType(type);
    if (type === "satellite") {
      mapInstanceRef.current.removeLayer(streetLayer);
      satelliteLayer.addTo(mapInstanceRef.current);
    } else {
      mapInstanceRef.current.removeLayer(satelliteLayer);
      streetLayer.addTo(mapInstanceRef.current);
    }
  };

  // Di chuyển marker và bay bản đồ tới tọa độ mới
  const flyToCoords = (lat: number, lng: number, zoom = 18) => {
    setCoords({ lat, lng });
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lng], zoom, { duration: 1.2 });
    }
  };

  // Tìm kiếm địa điểm theo tên đường / địa chỉ
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      let query = searchQuery.trim();
      if (!query.toLowerCase().includes("việt nam") && !query.toLowerCase().includes("vietnam")) {
        query += ", Việt Nam";
      }

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&countrycodes=vn&limit=1`,
        {
          headers: {
            "Accept-Language": "vi,en",
          },
        }
      );

      if (!res.ok) throw new Error("Không thể kết nối dịch vụ bản đồ");
      const data = await res.json();

      if (data && data.length > 0) {
        const foundLat = parseFloat(data[0].lat);
        const foundLng = parseFloat(data[0].lon);
        flyToCoords(foundLat, foundLng, 18);
        toast.success(`Đã định vị: ${data[0].display_name.split(",")[0]}`);
      } else {
        toast.warning("Không tìm thấy tọa độ cho địa chỉ này. Bạn hãy kéo ghim thủ công hoặc dán link Google Maps.");
      }
    } catch {
      toast.error("Lỗi khi tìm kiếm địa chỉ.");
    } finally {
      setSearching(false);
    }
  };

  // Xử lý dán tọa độ hoặc link Google Maps
  const handleParsePaste = () => {
    if (!pasteInput.trim()) {
      toast.warning("Vui lòng nhập hoặc dán tọa độ / link Google Maps");
      return;
    }

    const parsed = parseCoordinates(pasteInput);
    if (parsed) {
      flyToCoords(parsed.latitude, parsed.longitude, 18);
      toast.success(`Nhận diện tọa độ thành công: ${parsed.latitude}, ${parsed.longitude}`);
      setPasteInput("");
    } else {
      toast.error("Không nhận diện được tọa độ. Mẫu hợp lệ: 10.024567, 105.083124 hoặc link Google Maps");
    }
  };

  // Lấy GPS trực tiếp từ thiết bị với độ chính xác cao
  const handleGetDeviceGPS = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast.warning("Thiết bị không hỗ trợ định vị GPS");
      return;
    }

    toast.info("Đang đọc tín hiệu GPS vệ tinh...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);
        setAccuracy(acc);

        flyToCoords(lat, lng, 18);

        // Vẽ vòng tròn bán kính sai số
        if (mapInstanceRef.current && (window as any).L) {
          const L = (window as any).L;
          if (circleRef.current) {
            mapInstanceRef.current.removeLayer(circleRef.current);
          }
          circleRef.current = L.circle([lat, lng], {
            radius: acc,
            color: acc <= 30 ? "#10b981" : "#f59e0b",
            fillColor: acc <= 30 ? "#10b981" : "#f59e0b",
            fillOpacity: 0.15,
            weight: 1.5,
          }).addTo(mapInstanceRef.current);
        }

        if (acc <= 30) {
          toast.success(`GPS vệ tinh chính xác: ${lat}, ${lng} (Sai số ±${acc}m)`);
        } else {
          toast.warning(
            `Vị trí ước tính (Sai số ±${acc}m do dùng mạng Wi-Fi/IP). Bạn hãy nhìn bản đồ vệ tinh và kéo con ghim vào đúng nóc nhà!`
          );
        }
      },
      (err) => {
        let msg = "Không thể lấy vị trí thiết bị";
        if (err.code === 1) msg = "Vui lòng cho phép quyền vị trí trên trình duyệt";
        else if (err.code === 2) msg = "Không bắt được sóng GPS";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Xác nhận lưu tọa độ
  const handleConfirm = () => {
    onConfirm({
      latitude: coords.lat,
      longitude: coords.lng,
      address: searchQuery || initialAddress || undefined,
    });
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-map-marked-alt text-white"></i>
          <span>Chấm ghim vị trí chuẩn xác (Bản đồ Vệ tinh & Tọa độ GPS)</span>
        </div>
      }
      size="xxl"
      dialogStyle={{ maxWidth: "min(1360px, 96vw)", width: "100%" }}
      bodyClass="p-0"
    >
      <div className="d-flex flex-column" style={{ height: "76vh", minHeight: "540px" }}>
        {/* THANH ĐIỀU KHIỂN TRÊN CÙNG */}
        <div className="bg-light p-2.5 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
          {/* Form tìm kiếm địa chỉ */}
          <form onSubmit={handleSearchAddress} className="d-flex align-items-center gap-1.5 flex-grow-1" style={{ maxWidth: "460px" }}>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white">
                <i className="fas fa-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Tìm tên đường, số nhà, phường xã, TP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary fw-semibold" disabled={searching}>
                {searching ? <span className="spinner-border spinner-border-sm"></span> : "Tìm kiếm"}
              </button>
            </div>
          </form>

          {/* Dán nhanh link/tọa độ Google Maps */}
          <div className="d-flex align-items-center gap-1.5 flex-grow-1" style={{ maxWidth: "420px" }}>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white">
                <i className="fas fa-paste text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Dán tọa độ (10.0245, 105.0831) hoặc link Google Maps"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleParsePaste();
                  }
                }}
              />
              <button type="button" className="btn btn-outline-secondary fw-semibold" onClick={handleParsePaste}>
                Nhận diện
              </button>
            </div>
          </div>

          {/* Nút công cụ nhanh */}
          <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
            {/* Chuyển lớp bản đồ */}
            <div className="btn-group btn-group-sm shadow-xs" role="group">
              <button
                type="button"
                className={`btn ${mapType === "satellite" ? "btn-dark fw-bold" : "btn-light border"}`}
                onClick={() => toggleMapLayer("satellite")}
                title="Xem ảnh vệ tinh rõ nóc nhà"
              >
                <i className="fas fa-satellite me-1 text-warning"></i>Vệ tinh
              </button>
              <button
                type="button"
                className={`btn ${mapType === "street" ? "btn-dark fw-bold" : "btn-light border"}`}
                onClick={() => toggleMapLayer("street")}
                title="Xem bản đồ giao thông đường phố"
              >
                <i className="fas fa-road me-1 text-primary"></i>Đường phố
              </button>
            </div>

            {/* Nút lấy GPS thiết bị */}
            <button
              type="button"
              className="btn btn-sm btn-outline-primary fw-semibold d-inline-flex align-items-center gap-1 shadow-xs"
              onClick={handleGetDeviceGPS}
              title="Lấy vị trí GPS hiện tại của thiết bị này"
            >
              <i className="fas fa-location-crosshairs text-danger"></i>
              <span>GPS thiết bị</span>
            </button>
          </div>
        </div>

        {/* KHUNG HIỂN THỊ BẢN ĐỒ LEAFLET */}
        <div className="flex-grow-1 position-relative w-100 h-100">
          <div ref={mapContainerRef} className="w-100 h-100 bg-light" style={{ minHeight: "360px" }} />

          {/* HUD Bảng tọa độ nổi góc trên */}
          <div
            className="position-absolute top-0 end-0 m-3 p-2.5 rounded-3 shadow bg-white border d-flex flex-column gap-1"
            style={{ zIndex: 1000, maxWidth: "320px", fontSize: "12px" }}
          >
            <div className="fw-bold text-dark d-flex align-items-center justify-content-between">
              <span>
                <i className="fas fa-crosshairs text-danger me-1"></i>Vị trí đang ghim:
              </span>
              <span className="badge bg-primary font-monospace" style={{ fontSize: "11px" }}>
                Zoom: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            </div>
            <div className="font-monospace text-primary fw-bold" style={{ fontSize: "13px" }}>
              {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
            </div>
            {accuracy != null && (
              <div
                className={`small fw-semibold ${accuracy <= 30 ? "text-success" : "text-warning-emphasis"}`}
                style={{ fontSize: "11px" }}
              >
                <i className={`fas fa-${accuracy <= 30 ? "check-circle" : "exclamation-triangle"} me-1`}></i>
                Sai số thiết bị: ±{accuracy}m
              </div>
            )}
            <div className="text-muted mt-1" style={{ fontSize: "11px", lineHeight: "1.3" }}>
              💡 <em>Kéo thả con ghim đỏ hoặc nhấp vào bất kỳ điểm nào trên bản đồ để đặt đúng cửa nhà khách hàng.</em>
            </div>
          </div>
        </div>

        {/* THANH CHÂN MODAL */}
        <div className="bg-white p-2.5 px-3 border-top d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2 text-muted small">
            <i className="fas fa-info-circle text-primary"></i>
            <span>
              Tọa độ này sẽ được dùng để mở <strong>Google Maps Turn-by-Turn Navigation</strong> cho kỹ thuật viên dẫn đường chuẩn xác 100%.
            </span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button type="button" className="btn btn-outline-secondary btn-sm px-3" onClick={onClose}>
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm px-4 fw-bold shadow-sm d-inline-flex align-items-center gap-1.5"
              onClick={handleConfirm}
            >
              <i className="fas fa-check"></i>
              <span>Xác nhận vị trí ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})</span>
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
