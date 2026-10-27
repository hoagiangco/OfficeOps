import React from "react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "OfficeOps – Kỹ thuật viên",
  description: "Ứng dụng tác nghiệp di động cho Kỹ thuật viên OfficeOps",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OfficeOps Tech",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0284c7",
};

export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tech-mobile-container min-vh-100 bg-slate-100 text-dark">
      {children}
    </div>
  );
}
