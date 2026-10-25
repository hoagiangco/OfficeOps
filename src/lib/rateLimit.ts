// Helper đơn giản & hiệu quả cho Rate Limiting theo In-Memory Sliding Window
// Hỗ trợ kiểm tra giới hạn lượt gọi theo IP/Key

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Định kỳ dọn dẹp các key đã hết hạn mỗi 5 phút
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Kiểm tra xem một key (IP hoặc ID) có vượt quá giới hạn hay không
 * @param key Chuỗi định danh duy nhất (vd: "upload:192.168.1.1")
 * @param limit Số lượng request tối đa trong cửa sổ thời gian
 * @param windowMs Thời gian cửa sổ (milliseconds)
 * @returns { allowed: boolean, remaining: number, resetInSec: number }
 */
export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    // Tạo mới hoặc làm mới chu kỳ
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetInSec: Math.ceil(windowMs / 1000),
    };
  }

  if (record.count >= limit) {
    const resetInSec = Math.ceil((record.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetInSec: resetInSec > 0 ? resetInSec : 1,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: limit - record.count,
    resetInSec: Math.ceil((record.resetAt - now) / 1000),
  };
}

/**
 * Lấy IP client từ Request headers
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}
