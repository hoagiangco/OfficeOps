import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    useTypeScriptCli: true,
    // Ứng dụng nội bộ yêu cầu đăng nhập: các trang luôn render theo request (đọc cookie phiên),
    // nên chỉ kiểm tra "instant navigation" ở segment nào bật `instant` một cách tường minh.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
