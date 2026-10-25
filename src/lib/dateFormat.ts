/**
 * Tiện ích định dạng ngày giờ chuẩn Việt Nam (Asia/Ho_Chi_Minh)
 */

export const getVNNow = (): Date => {
  try {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  } catch {
    return new Date();
  }
};

export const getVNTodayStr = (): string => {
  const now = getVNNow();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const formatDateDisplay = (value?: string | Date | null): string => {
  if (!value) return "";
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
};

export const formatDateTime = (value?: string | Date | null): string => {
  if (!value) return "";
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";

    const datePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);

    return `${datePart} ${timePart}`;
  } catch {
    return "";
  }
};

export const formatDateInput = (value?: string | Date | null): string => {
  if (!value) return "";
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
};
