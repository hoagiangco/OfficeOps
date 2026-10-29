'use client';

import { useEffect } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { closeTopModalOnEscape } from '@/components/ModalShell';

export default function ToastProvider() {
  useEffect(() => {
    window.addEventListener('keydown', closeTopModalOnEscape);
    return () => window.removeEventListener('keydown', closeTopModalOnEscape);
  }, []);

  return (
    <ToastContainer
      position="bottom-right"
      autoClose={2500}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick
      pauseOnFocusLoss={false}
      draggable
      pauseOnHover
      theme="colored"
      limit={4}
    />
  );
}
