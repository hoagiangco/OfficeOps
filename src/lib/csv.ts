// Xuất dữ liệu bảng ra file CSV có BOM UTF-8 để mở trực tiếp bằng Microsoft Excel không lỗi font tiếng Việt
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  if (typeof window === "undefined") return;

  const escapeCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const str = String(val).replace(/"/g, '""');
    if (/[",\n\r]/.test(str)) {
      return `"${str}"`;
    }
    return str;
  };

  const csvLines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];

  // Thêm BOM \uFEFF để Excel nhận diện UTF-8
  const blob = new Blob(["\uFEFF" + csvLines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
