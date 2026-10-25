/**
 * OfficeOps Offline Queue (IndexedDB)
 * Quản lý hàng đợi ngoại tuyến cho Kỹ thuật viên hiện trường (/tech)
 */

export interface OfflineAction {
  id: string;
  type: "CHECK_IN" | "COMPLETE_TICKET" | "RECORD_COUNTER" | "UPLOAD_PHOTO";
  title: string;
  url: string;
  method: "POST" | "PATCH";
  headers?: Record<string, string>;
  body: any;
  createdAt: string;
  status: "PENDING" | "SYNCING" | "FAILED";
  retryCount: number;
  lastError?: string;
  ticketId?: string;
}

const DB_NAME = "officeops_offline_v1";
const STORE_NAME = "sync_queue";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Thêm một tác vụ vào hàng đợi ngoại tuyến
 */
export async function enqueueAction(
  action: Omit<OfflineAction, "id" | "createdAt" | "status" | "retryCount">
): Promise<OfflineAction> {
  const db = await openDB();
  const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullAction: OfflineAction = {
    ...action,
    id,
    createdAt: new Date().toISOString(),
    status: "PENDING",
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(fullAction);

    req.onsuccess = () => {
      notifyQueueChange();
      resolve(fullAction);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lấy danh sách các tác vụ đang chờ
 */
export async function getPendingActions(): Promise<OfflineAction[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const list: OfflineAction[] = req.result || [];
        // Sắp xếp theo thời gian tạo cũ -> mới để đồng bộ tuần tự
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Đếm số lượng tác vụ đang chờ đồng bộ
 */
export async function getPendingCount(): Promise<number> {
  const items = await getPendingActions();
  return items.filter((item) => item.status === "PENDING" || item.status === "FAILED").length;
}

/**
 * Xóa tác vụ đã đồng bộ thành công khỏi hàng đợi
 */
export async function removeAction(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        notifyQueueChange();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Error removing offline action:", err);
  }
}

/**
 * Cập nhật trạng thái tác vụ
 */
export async function updateAction(
  id: string,
  updates: Partial<OfflineAction>
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (!getReq.result) return resolve();
        const updated = { ...getReq.result, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => {
          notifyQueueChange();
          resolve();
        };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.error("Error updating offline action:", err);
  }
}

/**
 * Thông báo sự kiện thay đổi hàng đợi cho các component React
 */
function notifyQueueChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("officeops:queue-changed"));
  }
}

/**
 * Đồng bộ tất cả các tác vụ đang chờ trong hàng đợi lên server
 */
export async function syncQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("[OfflineQueue] Device is offline, skipping sync.");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const items = await getPendingActions();
  if (items.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[OfflineQueue] Starting sync for ${items.length} items...`);
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    // Không thử lại nếu đã thử sai quá 5 lần
    if (item.retryCount >= 5) {
      continue;
    }

    await updateAction(item.id, { status: "SYNCING" });

    try {
      let bodyData = item.body;
      const headers = {
        "Content-Type": "application/json",
        ...(item.headers || {}),
      };

      // Xử lý nếu body là FormData hoặc chứa file base64
      let fetchBody: any = JSON.stringify(bodyData);
      if (item.type === "UPLOAD_PHOTO" && bodyData?.isBase64) {
        // Chuyển base64 về blob để upload
        const byteCharacters = atob(bodyData.base64.split(",")[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: bodyData.mimeType || "image/jpeg" });
        const formData = new FormData();
        formData.append("file", blob, bodyData.fileName || "offline_upload.jpg");
        if (bodyData.ticketId) formData.append("ticketId", bodyData.ticketId);
        if (bodyData.kind) formData.append("kind", bodyData.kind);

        fetchBody = formData;
        delete (headers as any)["Content-Type"]; // Để browser tự gắn multipart boundary
      }

      const res = await fetch(item.url, {
        method: item.method,
        headers,
        body: fetchBody,
      });

      if (res.ok) {
        await removeAction(item.id);
        succeeded++;
        console.log(`[OfflineQueue] Successfully synced: ${item.title}`);
      } else {
        const errorText = await res.text();
        console.warn(`[OfflineQueue] Sync failed for ${item.title}: HTTP ${res.status}`, errorText);

        // Xử lý xung đột nghiệp vụ: Nếu ticket đã hoàn thành hoặc xung đột vĩnh viễn (400 / 404 / 409)
        // và đã retry quá 3 lần, ghi chú lỗi để KTV biết
        await updateAction(item.id, {
          status: "FAILED",
          retryCount: item.retryCount + 1,
          lastError: `Lỗi máy chủ (${res.status}): ${errorText.substring(0, 100)}`,
        });
        failed++;
      }
    } catch (err: any) {
      console.error(`[OfflineQueue] Network error while syncing ${item.title}:`, err);
      await updateAction(item.id, {
        status: "FAILED",
        retryCount: item.retryCount + 1,
        lastError: err.message || "Lỗi kết nối mạng",
      });
      failed++;
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("officeops:queue-synced", {
        detail: { succeeded, failed, total: items.length },
      })
    );
  }

  return { processed: items.length, succeeded, failed };
}

// Tự động lắng nghe sự kiện mạng trở lại trên client
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[OfflineQueue] Network restored. Triggering auto-sync...");
    syncQueue();
  });
}
