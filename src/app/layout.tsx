import type { Metadata, Viewport } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./hoagiang.css";
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "OfficeOps – Quản lý Máy văn phòng & Dịch vụ Kỹ thuật",
  description: "Hệ thống Quản lý Máy văn phòng & Dịch vụ Kỹ thuật tập trung",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OfficeOps",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full font-sans antialiased">
        <ServiceWorkerRegister />
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
