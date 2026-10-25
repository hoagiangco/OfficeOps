/**
 * Che/ẩn số điện thoại khách hàng nếu người dùng không có quyền "customer:view-phone".
 * Quy tắc che số:
 * - Nếu không có số hoặc chuỗi rỗng: giữ nguyên
 * - Nếu ngắn (<= 4 ký tự): trả về "****"
 * - Nếu từ 5 - 7 ký tự: giữ 2 số đầu và 2 số cuối, giữa là "****" (VD: "12345" -> "12****45")
 * - Nếu từ 8 ký tự trở lên (chuẩn SĐT di động/bàn VN): giữ 3 số đầu và 3 số cuối, giữa là "****" (VD: "0901234567" -> "090****567")
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "****";
  if (trimmed.length <= 7) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-3)}`;
}

/**
 * Kiểm tra xem một chuỗi số điện thoại đã bị che hay chưa.
 */
export function isMaskedPhone(phone?: string | null): boolean {
  if (!phone) return false;
  return phone.includes("*");
}

/**
 * Che số điện thoại trên đối tượng khách hàng (phone, contactPhone, managerPhone).
 */
export function maskCustomerPhones<T extends Record<string, any>>(
  customer: T,
  canViewPhone: boolean
): T {
  if (canViewPhone || !customer) return customer;
  const result: Record<string, any> = { ...customer };

  if ("phone" in result && typeof result.phone === "string") {
    result.phone = maskPhoneNumber(result.phone);
  }
  if ("contactPhone" in result && typeof result.contactPhone === "string") {
    result.contactPhone = maskPhoneNumber(result.contactPhone);
  }
  if ("managerPhone" in result && typeof result.managerPhone === "string") {
    result.managerPhone = maskPhoneNumber(result.managerPhone);
  }

  return result as T;
}

/**
 * Che số điện thoại trên mảng danh sách khách hàng.
 */
export function maskCustomersList<T extends Record<string, any>>(
  customers: T[],
  canViewPhone: boolean
): T[] {
  if (canViewPhone || !customers) return customers;
  return customers.map((c) => maskCustomerPhones(c, false));
}
