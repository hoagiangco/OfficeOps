import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./hoagiang.css";
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: "OfficeOps – Quản lý Máy văn phòng & Dịch vụ Kỹ thuật",
  description: "Hệ thống Quản lý Máy văn phòng & Dịch vụ Kỹ thuật tập trung",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full font-sans antialiased">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
