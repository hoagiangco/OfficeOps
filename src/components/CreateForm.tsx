"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "email" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
};

/** Form tạo mới dùng chung: gửi JSON tới `endpoint`, bỏ trường rỗng, số được ép kiểu ở server (z.coerce). */
export default function CreateForm({ endpoint, fields, title }: { endpoint: string; fields: Field[]; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const f of fields) {
      const v = String(fd.get(f.name) ?? "").trim();
      if (v !== "") body[f.name] = v;
    }
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const details = j.details ? " – " + Object.entries(j.details).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`).join("; ") : "";
      setError((j.error ?? "Có lỗi xảy ra") + details);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white">
        + {title}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">{title}</h2>
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm text-gray-700">
          {f.label}
          {f.required && <span className="sr-only">(bắt buộc)</span>}
          {f.type === "select" ? (
            <select name={f.name} required={f.required} defaultValue={f.defaultValue ?? ""} className="rounded border border-gray-300 p-2 text-gray-900">
              <option value="">-- Chọn --</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={f.name}
              type={f.type ?? "text"}
              required={f.required}
              defaultValue={f.defaultValue}
              step={f.type === "number" ? "any" : undefined}
              className="rounded border border-gray-300 p-2 text-gray-900"
            />
          )}
        </label>
      ))}
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={loading} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">
          {loading ? "Đang lưu..." : "Lưu"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-gray-300 px-3 py-1.5 text-sm">
          Hủy
        </button>
      </div>
    </form>
  );
}
