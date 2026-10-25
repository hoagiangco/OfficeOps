'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Kiểm tra yêu cầu mật khẩu
  const hasMinLen = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isFormValid = hasMinLen && hasLetter && hasNumber && isMatch && token.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || loading) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đặt lại mật khẩu thất bại.');
      }

      setIsSuccess(true);
      toast.success('Đặt lại mật khẩu thành công!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã xảy ra lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-800">Liên kết không hợp lệ</h3>
        <p className="text-sm text-gray-600 max-w-sm mx-auto">
          Không tìm thấy mã token xác thực khôi phục mật khẩu. Vui lòng kiểm tra lại liên kết trong email hoặc gửi lại yêu cầu mới.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
          >
            <ArrowLeft className="w-4 h-4" /> Về trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-gray-800">Đặt lại mật khẩu thành công!</h3>
        <p className="text-sm text-gray-600 max-w-sm mx-auto">
          Mật khẩu mới của bạn đã được cập nhật an toàn vào hệ thống. Bây giờ bạn có thể đăng nhập bằng mật khẩu mới này.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90"
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Mật khẩu mới */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Mật khẩu mới <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            placeholder="Tối thiểu 8 ký tự, gồm cả chữ và số"
            className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Tiêu chuẩn */}
        <div className="mt-2 space-y-1 text-xs">
          <div className={`flex items-center gap-1.5 ${hasMinLen ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
            {hasMinLen ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 text-gray-400" />}
            <span>Tối thiểu 8 ký tự</span>
          </div>
          <div className={`flex items-center gap-1.5 ${hasLetter ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
            {hasLetter ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 text-gray-400" />}
            <span>Chứa ít nhất 1 chữ cái (a-z, A-Z)</span>
          </div>
          <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
            {hasNumber ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 text-gray-400" />}
            <span>Chứa ít nhất 1 chữ số (0-9)</span>
          </div>
        </div>
      </div>

      {/* Xác nhận mật khẩu mới */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Xác nhận mật khẩu mới <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Nhập lại mật khẩu mới"
            className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {confirmPassword.length > 0 && !isMatch && (
          <p className="mt-1 text-xs text-red-500">Mật khẩu xác nhận chưa khớp</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!isFormValid || loading}
        className="w-full py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
      >
        <KeyRound className="w-4 h-4" />
        {loading ? 'Đang cập nhật mật khẩu...' : 'Xác Nhận Đổi Mật Khẩu'}
      </button>

      <div className="text-center pt-2">
        <Link href="/login" className="text-xs text-primary hover:underline">
          Quay lại trang Đăng nhập
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 text-center">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold">OfficeOps Security</h2>
          <p className="text-xs text-slate-400 mt-1">Thiết lập mật khẩu mới cho tài khoản của bạn</p>
        </div>

        {/* Content */}
        <div className="p-6">
          <Suspense fallback={<div className="text-center py-8 text-sm text-gray-500">Đang tải...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
