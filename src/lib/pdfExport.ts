/**
 * Xuất phần tử HTML sang file PDF (.pdf) chuẩn A4
 * Tải trực tiếp trên trình duyệt bằng html2pdf.js
 */

export async function exportElementToPdf(element: HTMLElement | string, filename: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const targetElement = typeof element === "string" ? document.getElementById(element) : element;
  if (!targetElement) {
    console.error("Không tìm thấy phần tử DOM để xuất PDF:", element);
    return false;
  }

  try {
    // Dynamic import html2pdf.js để tránh lỗi SSR
    const html2pdf = (await import("html2pdf.js")).default;

    const cleanFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

    const opt = {
      margin: [10, 10, 10, 10] as [number, number, number, number], // lề 10mm các phía
      filename: cleanFilename,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait" as const,
      },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    };

    await html2pdf().set(opt).from(targetElement).save();
    return true;
  } catch (error) {
    console.error("Lỗi trong quá trình xuất PDF:", error);
    throw error;
  }
}
