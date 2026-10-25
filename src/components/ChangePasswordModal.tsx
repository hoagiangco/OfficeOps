'use client';

import React, { useState } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { KeyRound, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangePasswordModal({ isOpen, onClose, onSuccess }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Kiểm tra yêu cầu mật khẩu mới
  const hasMinLen = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isDifferentFromOld = oldPassword.length > 0 && newPassword.length > 0 && oldPassword !== newPassword;

  const isFormValid = hasMinLen && hasLetter && hasNumber && isMatch && isDifferentFromOld;

  const resetForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg('');
    setShowOld(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || loading) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại.');
      }

      toast.success(data.message || 'Đổi mật khẩu thành công!');
      resetForm();
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã xảy ra lỗi khi đổi mật khẩu.');
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
          <KeyRound className="w-5 h-5 text-primary" />
          <span className="font-semibold text-gray-800">Đổi Mật Khẩu</span>
        </div>
      }
      size="md"
      headerClass="bg-gray-50 border-b border-gray-200"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Mật khẩu cũ */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Mật khẩu hiện tại <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showOld ? 'text' : 'password'}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              placeholder="Nhập mật khẩu bạn đang dùng"
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowOld(!showOld)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mật khẩu mới */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Mật khẩu mới <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Tối thiểu 8 ký tự, gồm cả chữ và số"
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Checklist tiêu chí */}
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
            {oldPassword && newPassword && !isDifferentFromOld && (
              <div className="flex items-center gap-1.5 text-red-500 font-medium">
                <XCircle className="w-3.5 h-3.5" />
                <span>Mật khẩu mới phải khác mật khẩu hiện tại</span>
              </div>
            )}
          </div>
        </div>

        {/* Nhập lại mật khẩu mới */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Xác nhận mật khẩu mới <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Nhập lại mật khẩu mới vừa nhập"
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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

        {/* Nút hành động */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={!isFormValid || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading ? 'Đang cập nhật...' : 'Đổi Mật Khẩu'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
