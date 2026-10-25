import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Trả về ảnh QR (SVG) chứa liên kết trực tiếp tới Cổng tiếp nhận sự cố công khai /scan/[qrCode]
export const GET = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  const eq = await prisma.equipment.findUnique({
    where: { id },
    select: { qrCode: true, serialNumber: true },
  });
  if (!eq) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const isRaw = sp.get("raw") === "true";

  let qrContent = eq.qrCode;
  if (!isRaw) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:5000";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    qrContent = `${proto}://${host}/scan/${encodeURIComponent(eq.qrCode)}`;
  }

  const svg = await QRCode.toString(qrContent, {
    type: "svg",
    margin: 1,
    width: 260,
    color: {
      dark: "#1e293b",
      light: "#ffffff",
    },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
