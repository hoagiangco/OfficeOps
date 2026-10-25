'use client';

import React, { useState, useEffect } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { Mail, CheckCircle2, AlertCircle, RefreshCw, Send, Server } from 'lucide-react';
import { toast } from 'react-toastify';

interface MailTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SmtpStatus {
  isConfigured: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  connection: {
    ok: boolean;
    message: string;
  };
}

export function MailTestModal({ isOpen, onClose }: MailTestModalProps) {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/mail-test');
      if (res.ok) {
        const data = await res.json();
        setSmtpStatus(data);
      } else {
        toast.error('Không thể kiểm tra trạng thái SMTP');
      }
    } catch {
      toast.error('Lỗi kết nối kiểm tra SMTP');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const handleSendTestMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendingTest) return;

    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/mail-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail || undefined }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ ok: true, msg: data.message });
        toast.success(data.message);
      } else {
        setTestResult({ ok: false, msg: data.error || 'Gửi email thử nghiệm thất bại' });
        toast.error(data.error || 'Gửi email thử nghiệm thất bại');
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message || 'Lỗi mạng khi gửi email' });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <span className="font-semibold text-gray-800">Kiểm Tra Máy Chủ Email (SMTP)</span>
        </div>
      }
      size="md"
      headerClass="bg-gray-50 border-b border-gray-200"
    >
      <div className="space-y-4 py-2">
        {/* Card trạng thái cấu hình */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wider">
              <Server className="w-4 h-4 text-slate-500" /> Cấu hình máy chủ SMTP
            </span>
            <button
              type="button"
              onClick={fetchStatus}
              disabled={loadingStatus}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingStatus ? 'animate-spin' : ''}`} />
              Kiểm tra lại
            </button>
          </div>

          {loadingStatus ? (
            <div className="py-2 text-center text-xs text-gray-500">Đang kết nối kiểm tra SMTP...</div>
          ) : smtpStatus ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Trạng thái cấu hình:</span>
                <span className={smtpStatus.isConfigured ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                  {smtpStatus.isConfigured ? '✓ Đã thiết lập (.env)' : '⚠️ Chưa cấu hình'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Máy chủ (Host:Port):</span>
                <span className="font-mono text-gray-800">
                  {smtpStatus.smtpHost ? `${smtpStatus.smtpHost}:${smtpStatus.smtpPort}` : 'Chưa có'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tài khoản gửi (User):</span>
                <span className="font-mono text-gray-800">{smtpStatus.smtpUser || 'Chưa có'}</span>
              </div>
              <div className="flex items-start justify-between pt-1 border-t border-slate-200">
                <span className="text-gray-500">Kiểm tra Handshake:</span>
                <span className={`font-semibold ${smtpStatus.connection.ok ? 'text-green-600' : 'text-red-500'}`}>
                  {smtpStatus.connection.ok ? '✓ Sẵn sàng gửi' : `✗ ${smtpStatus.connection.message}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-red-500">Không lấy được thông tin cấu hình</div>
          )}
        </div>

        {/* Form gửi thử nghiệm */}
        <form onSubmit={handleSendTestMail} className="space-y-3 pt-1">
          <label className="block text-xs font-semibold text-gray-700">
            Gửi email thử nghiệm đến địa chỉ:
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Để trống sẽ gửi tới email của bạn"
              className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              type="submit"
              disabled={sendingTest || !smtpStatus?.isConfigured}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {sendingTest ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Gửi thử
                </>
              )}
            </button>
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded-lg flex items-start gap-2 text-xs ${
                testResult.ok
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{testResult.msg}</span>
            </div>
          )}
        </form>

        <div className="pt-2 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Đóng
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
