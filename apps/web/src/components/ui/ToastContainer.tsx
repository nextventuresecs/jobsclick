'use client';

import React from 'react';
import { useAppContext } from '@/context/AppContext';

export function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const badgeStyles =
          toast.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-900'
            : toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 bg-white text-slate-900';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border p-4 shadow-lg transition-all ${badgeStyles}`}
          >
            <div className="text-sm">
              <p className="font-semibold">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs opacity-90">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-xs opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}