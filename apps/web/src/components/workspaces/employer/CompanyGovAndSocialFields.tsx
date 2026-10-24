'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { CompanyEditFormData } from './CompanyProfileForm';
import { CheckCircle2, Award } from 'lucide-react';

export function CompanyGovAndSocialFields({ formData: d }: { readonly formData: CompanyEditFormData }) {
  const t = useTranslations('EmployerWorkspace');

  return (
    <>
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">5. Government Registrations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>MSME Registered?</span>
              </label>
              <input type="checkbox" checked={d.formIsMsme} onChange={(e) => d.setFormIsMsme(e.target.checked)} className="w-4 h-4 text-emerald-600 rounded" />
            </div>
            {d.formIsMsme && (
              <div>
                <label className="block text-[11px] font-semibold text-emerald-900 mb-1">{t('labelUdyamNumber')}</label>
                <input type="text" value={d.formUdyamNumber} onChange={(e) => d.setFormUdyamNumber(e.target.value.toUpperCase())} placeholder="UDYAM-MH-26-0019482" className="w-full px-3 py-2 text-xs font-mono uppercase bg-white rounded-xl border border-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" required={d.formIsMsme} />
              </div>
            )}
          </div>
          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-blue-600" />
                <span>DPIIT Startup India Registered?</span>
              </label>
              <input type="checkbox" checked={d.formIsDpiit} onChange={(e) => d.setFormIsDpiit(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
            </div>
            {d.formIsDpiit && (
              <div>
                <label className="block text-[11px] font-semibold text-blue-900 mb-1">{t('labelDpiitNumber')}</label>
                <input type="text" value={d.formDpiitNumber} onChange={(e) => d.setFormDpiitNumber(e.target.value.toUpperCase())} placeholder="DIPP-89102-MH" className="w-full px-3 py-2 text-xs font-mono uppercase bg-white rounded-xl border border-blue-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden" required={d.formIsDpiit} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">6. Social Media Links (Optional)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Instagram URL</label>
            <input type="url" value={d.formInstagram} onChange={(e) => d.setFormInstagram(e.target.value)} placeholder="https://instagram.com/company" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Facebook URL</label>
            <input type="url" value={d.formFacebook} onChange={(e) => d.setFormFacebook(e.target.value)} placeholder="https://facebook.com/company" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">YouTube URL</label>
            <input type="url" value={d.formYoutube} onChange={(e) => d.setFormYoutube(e.target.value)} placeholder="https://youtube.com/@company" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Other Profile URL</label>
            <input type="url" value={d.formOtherSocial} onChange={(e) => d.setFormOtherSocial(e.target.value)} placeholder="https://linkedin.com/company" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-orange focus:outline-hidden" />
          </div>
        </div>
      </div>
    </>
  );
}
