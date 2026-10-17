'use client';

import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isInfo = toast.type === 'info';
        const isWarning = toast.type === 'warning';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-3 ${
              isSuccess
                ? 'bg-white/95 border-emerald-200 text-emerald-950'
                : isInfo
                ? 'bg-white/95 border-blue-200 text-blue-950'
                : isWarning
                ? 'bg-white/95 border-amber-200 text-amber-950'
                : 'bg-white/95 border-red-200 text-red-950'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              {isInfo && <Info className="w-5 h-5 text-blue-600" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-600" />}
              {isError && <XCircle className="w-5 h-5 text-red-600" />}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 leading-tight">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  {toast.message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
