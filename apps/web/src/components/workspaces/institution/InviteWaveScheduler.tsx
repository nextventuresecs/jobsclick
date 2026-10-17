'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export function InviteWaveScheduler() {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">{t('tabInvitations')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{t('waveSubheading')}</p>
      </div>

      <div className="divide-y divide-gray-100 text-xs">
        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Wave #1 - Diploma Mechanical & ITI 2026</h3>
            <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-01 • 120 Invitations Sent • Cost: ₹21.60</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              94% Joined
            </span>
            <span className="font-mono text-gray-400">113 Claimed</span>
          </div>
        </div>

        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Wave #2 - Electronics & BCA 2026</h3>
            <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-08 • 85 Invitations Sent • Cost: ₹15.30</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              72% Joined
            </span>
            <span className="font-mono text-gray-400">61 Claimed</span>
          </div>
        </div>

        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Wave #3 - Computer Science & Civil 2026</h3>
            <p className="text-gray-500 mt-0.5">Dispatched: 2026-10-14 • 50 Invitations Sent • Cost: ₹9.00</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              48% In Progress
            </span>
            <span className="font-mono text-gray-400">24 Claimed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
