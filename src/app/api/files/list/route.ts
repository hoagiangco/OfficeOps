import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getSession } from "@/lib/auth";

interface FileItemInfo {
  name: string;
  url: string;
  path: string;
  size: number;
  modified: string;
  isDirectory: boolean;
}

// Hàm duyệt file đệ quy trong thư mục uploads
async function getFilesRecursively(dir: string, baseDir: string): Promise<FileItemInfo[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: FileItemInfo[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // Bỏ qua file ẩn

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await getFilesRecursively(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      try {
        const fileStats = await stat(fullPath);
        // Đường dẫn tương đối từ baseDir: vd "tickets/abc.jpg" hoặc "abc.jpg"
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
        const webUrl = `/uploads/${relPath}`;

        files.push({
          name: entry.name,
          url: webUrl,
          path: webUrl,
          size: fileStats.size,
          modified: fileStats.mtime.toISOString(),
          isDirectory: false,
        });
      } catch (err) {
        console.warn("Lỗi đọc file:", fullPath, err);
      }
    }
  }

  return files;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Kiểm tra xác thực phiên đăng nhập
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "24", 10));
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const type = (searchParams.get("type") || "").trim().toLowerCase();

    // Dùng thư mục cục bộ public/uploads trên máy chủ/host
    let uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (process.env.UPLOAD_DIR) {
      uploadsDir = path.isAbsolute(process.env.UPLOAD_DIR)
        ? process.env.UPLOAD_DIR
        : path.join(process.cwd(), process.env.UPLOAD_DIR);
    }

    let allFiles: FileItemInfo[] = [];
    if (existsSync(uploadsDir)) {
      allFiles = await getFilesRecursively(uploadsDir, uploadsDir);
    }

    // 2. Lọc theo từ khóa tìm kiếm
    if (q) {
      allFiles = allFiles.filter((f) => f.name.toLowerCase().includes(q));
    }

    // 3. Lọc theo định dạng
    if (type === "image") {
      const imgExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"];
      allFiles = allFiles.filter((f) => {
        const ext = path.extname(f.name).toLowerCase();
        return imgExts.includes(ext);
      });
    } else if (type === "document") {
      const docExts = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv"];
      allFiles = allFiles.filter((f) => {
        const ext = path.extname(f.name).toLowerCase();
        return docExts.includes(ext);
      });
    }

    // 4. Sắp xếp mới nhất lên đầu
    allFiles.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    // 5. Phân trang
    const total = allFiles.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedFiles = allFiles.slice(startIndex, startIndex + limit);

    return NextResponse.json(
      {
        files: paginatedFiles,
        total,
        page,
        limit,
        totalPages,
      },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    console.error("Lỗi khi lấy danh sách file:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi khi lấy danh sách file" },
      { status: 500 }
    );
  }
}
