import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Trả về ảnh QR (SVG) chứa mã định danh duy nhất của thiết bị.
export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;
  const { id } = await params;
  const eq = await prisma.equipment.findUnique({ where: { id }, select: { qrCode: true } });
  if (!eq) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });
  const svg = await QRCode.toString(eq.qrCode, { type: "svg", margin: 1, width: 240 });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
});
