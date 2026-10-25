'use client';

import React, { useState } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { Mail, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleClose = () => {
    setEmail('');
    setIsSubmitted(false);
    setErrorMsg('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gửi yêu cầu thất bại');
      }

      setIsSubmitted(true);
      toast.success('Yêu cầu đã được ghi nhận!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã xảy ra lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <span className="font-semibold text-gray-800">Khôi phục mật khẩu</span>
        </div>
      }
      size="sm"
      headerClass="bg-gray-50 border-b border-gray-200"
    >
      <div className="py-2">
        {isSubmitted ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h4 className="font-semibold text-gray-800 text-base">Kiểm tra hộp thư của bạn</h4>
            <p className="text-xs text-gray-600 leading-relaxed px-2">
              Nếu địa chỉ <strong>{email}</strong> tồn tại trên hệ thống, chúng tôi đã gửi email chứa liên kết đặt lại mật khẩu (hiệu lực trong 30 phút).
            </p>
            <p className="text-xs text-gray-400">
              Vui lòng kiểm tra cả thư mục <em>Spam / Rác</em> nếu chưa thấy thư đến.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
              >
                Đã hiểu & Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              Nhập địa chỉ email đăng ký tài khoản của bạn. Hệ thống sẽ gửi cho bạn một liên kết an toàn để đặt lại mật khẩu mới.
            </p>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email tài khoản <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={!email || loading}
                className="px-4 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? 'Đang gửi...' : 'Gửi liên kết'}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
