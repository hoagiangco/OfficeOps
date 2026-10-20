"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

const DEMO_ACCOUNTS = [
  { role: "Giám đốc (SuperAdmin)", email: "giamdoc@officeops.local" },
  { role: "Kế toán (Admin)", email: "ketoan@officeops.local" },
  { role: "Điều phối / Thủ kho", email: "dieuphoi@officeops.local" },
  { role: "Kỹ thuật viên", email: "kythuat@officeops.local" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? "Đăng nhập thất bại";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Đăng nhập thành công!");
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="login-page-wrapper">
      <div className="login-background">
        <div className="login-background-overlay"></div>
      </div>
      <div className="container-fluid">
        <div className="row justify-content-center align-items-center min-vh-100">
          <div className="col-12 col-sm-10 col-md-6 col-lg-4 col-xl-4">
            <div className="login-card">
              {/* Logo Section */}
              <div className="login-logo-container">
                <div className="login-logo bg-primary text-white shadow">
                  <i className="fas fa-print"></i>
                </div>
                <h2 className="login-title">OfficeOps Manager</h2>
                <p className="login-subtitle">
                  Hệ thống Quản lý Máy văn phòng &amp; Dịch vụ Kỹ thuật
                </p>
              </div>

              {/* Form Section */}
              <div className="login-form-container">
                <div className={`login-error-container ${error ? "has-error" : ""}`}>
                  {error && (
                    <div className="alert alert-danger mb-3 login-error-alert py-2" role="alert">
                      <strong>
                        <i className="fas fa-exclamation-circle me-2"></i>Lỗi đăng nhập:
                      </strong>
                      <div className="mt-1 small">{error}</div>
                    </div>
                  )}
                </div>

                <form onSubmit={onSubmit} className="login-form">
                  <div className="form-group mb-3">
                    <label htmlFor="email" className="form-label">
                      <i className="fas fa-envelope me-2"></i>Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Nhập email của bạn"
                      className="form-control form-control-lg"
                    />
                  </div>

                  <div className="form-group mb-3 position-relative">
                    <label htmlFor="password" className="form-label d-flex justify-content-between">
                      <span>
                        <i className="fas fa-lock me-2"></i>Mật khẩu
                      </span>
                    </label>
                    <div className="position-relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Nhập mật khẩu"
                        className="form-control form-control-lg"
                        style={{ paddingRight: "2.5rem" }}
                      />
                      <button
                        type="button"
                        className="btn btn-link position-absolute end-0 top-50 translate-middle-y text-muted text-decoration-none shadow-none"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ zIndex: 10 }}
                        tabIndex={-1}
                      >
                        <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`}></i>
                      </button>
                    </div>
                  </div>

                  <div className="form-group mb-4">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="rememberMe"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="rememberMe">
                        Ghi nhớ đăng nhập
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary btn-lg w-100 login-submit-btn"
                  >
                    {loading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Đang đăng nhập...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-sign-in-alt me-2"></i>
                        Đăng nhập
                      </>
                    )}
                  </button>
                </form>

                {/* Gợi ý nhanh tài khoản mẫu */}
                <div className="login-accounts-info">
                  <div className="alert p-2 mb-0">
                    <strong className="d-block mb-1 small">
                      <i className="fas fa-key me-1 text-primary"></i>Tài khoản dùng thử (MK: Office@123):
                    </strong>
                    <div className="d-flex flex-wrap gap-1">
                      {DEMO_ACCOUNTS.map((acc) => (
                        <button
                          key={acc.email}
                          type="button"
                          className="btn btn-outline-secondary btn-sm py-0 px-2"
                          style={{ fontSize: "0.72rem" }}
                          onClick={() => {
                            setEmail(acc.email);
                            setPassword("Office@123");
                          }}
                        >
                          {acc.role}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
