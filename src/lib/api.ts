/**
 * HTTP Client tiện ích tương thích cú pháp HoaGiangManager (api.get, api.post, api.delete...)
 * Tự động gửi cookie session và hỗ trợ JSON / FormData.
 */

interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
}

class ApiError extends Error {
  response?: {
    status: number;
    data: unknown;
  };

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.response = { status, data };
  }
}

async function request<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const fullUrl = url.startsWith("/api") ? url : `/api${url.startsWith("/") ? url : `/${url}`}`;

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: "include", // Tự động gửi cookie phiên đăng nhập
  });

  let data: unknown = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorObj = data as { error?: string; message?: string } | null;
    const errorMsg = errorObj?.error || errorObj?.message || response.statusText || "Yêu cầu thất bại";
    throw new ApiError(errorMsg, response.status, data);
  }

  return {
    data: data as T,
    status: response.status,
    statusText: response.statusText,
  };
}

export const api = {
  get: <T = Record<string, unknown>>(url: string, options?: RequestInit) =>
    request<T>(url, { method: "GET", ...options }),

  post: <T = Record<string, unknown>>(url: string, body?: unknown, options?: RequestInit) => {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request<T>(url, {
      method: "POST",
      body: isFormData ? (body as FormData) : JSON.stringify(body),
      ...options,
    });
  },

  put: <T = Record<string, unknown>>(url: string, body?: unknown, options?: RequestInit) => {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request<T>(url, {
      method: "PUT",
      body: isFormData ? (body as FormData) : JSON.stringify(body),
      ...options,
    });
  },

  patch: <T = Record<string, unknown>>(url: string, body?: unknown, options?: RequestInit) => {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request<T>(url, {
      method: "PATCH",
      body: isFormData ? (body as FormData) : JSON.stringify(body),
      ...options,
    });
  },

  delete: <T = Record<string, unknown>>(url: string, options?: RequestInit) =>
    request<T>(url, { method: "DELETE", ...options }),
};

export default api;
