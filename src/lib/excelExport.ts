import * as XLSX from "xlsx";

export interface ExcelColumn<T> {
  header: string;
  key: keyof T | string;
  width?: number;
  formatter?: (val: any, row: T) => string | number;
}

/**
 * Xuất dữ liệu ra file Excel (.xlsx) chuẩn hóa UTF-8 tiếng Việt
 */
export function exportToXlsx<T extends Record<string, any>>(options: {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  data: T[];
  title?: string;
}) {
  const { filename, sheetName = "Sheet1", columns, data, title } = options;

  // Xây dựng ma trận hàng
  const rows: any[][] = [];

  // Thêm tiêu đề lớn (nếu có)
  if (title) {
    rows.push([title]);
    rows.push([`Ngày xuất: ${new Date().toLocaleString("vi-VN")}`]);
    rows.push([]); // dòng trống
  }

  // Header row
  const headers = columns.map((c) => c.header);
  rows.push(headers);

  // Data rows
  data.forEach((row) => {
    const rowValues = columns.map((col) => {
      const val = row[col.key as keyof T];
      if (col.formatter) {
        return col.formatter(val, row);
      }
      return val ?? "";
    });
    rows.push(rowValues);
  });

  // Tạo Worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Đặt độ rộng cột (Column Widths)
  ws["!cols"] = columns.map((c) => ({
    wch: c.width || Math.max(c.header.length + 4, 12),
  }));

  // Tạo Workbook và xuất file
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const cleanFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, cleanFilename);
}
