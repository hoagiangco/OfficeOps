/**
 * Nén ảnh phía client bằng HTML5 Canvas không phụ thuộc thư viện ngoài.
 * Giúp giảm kích thước file trước khi upload, tiết kiệm băng thông và dung lượng lưu trữ.
 */

export interface CompressionOptions {
  maxSizeMB?: number; // Ví dụ: 1MB
  maxWidthOrHeight?: number; // Ví dụ: 1920px
  quality?: number; // 0.85
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  // Chỉ nén nếu là file ảnh
  if (!file.type || !file.type.startsWith("image/")) {
    return file;
  }

  // Không nén ảnh động GIF hoặc SVG
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  const maxWidthOrHeight = options.maxWidthOrHeight ?? 1920;
  const quality = options.quality ?? 0.85;

  return new Promise((resolve) => {
    // Nếu chạy trên môi trường không có window/DOM
    if (typeof window === "undefined" || typeof document === "undefined") {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Tính toán tỷ lệ kích thước mới nếu vượt quá giới hạn
        if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
          if (width > height) {
            height = Math.round((height * maxWidthOrHeight) / width);
            width = maxWidthOrHeight;
          } else {
            width = Math.round((width * maxWidthOrHeight) / height);
            height = maxWidthOrHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        // Đổ nền trắng cho ảnh JPEG tránh trường hợp nền trong suốt thành màu đen
        if (file.type === "image/jpeg" || file.type === "image/jpg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // Nếu sau khi nén dung lượng lại lớn hơn file gốc, giữ lại file gốc
            if (blob.size >= file.size) {
              resolve(file);
              return;
            }

            const compressedFile = new File([blob], file.name, {
              type: mimeType,
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => {
        resolve(file);
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      resolve(file);
    };

    reader.readAsDataURL(file);
  });
}
