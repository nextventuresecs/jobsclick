'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '@indian-job-portal/ui';
import QRCode from 'qrcode';
import {
  QrCode,
  Share2,
  Copy,
  Check,
  Download,
  Printer,
  ShieldCheck,
  ExternalLink,
  Award,
} from 'lucide-react';

export interface ProfileQrShareCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly path: string;
  readonly badgeText?: string;
  readonly description?: string;
  readonly downloadFileName: string;
  readonly udyamOrAffiliation?: string;
  readonly locationText?: string;
  readonly isMsme?: boolean;
  readonly isInstitution?: boolean;
  readonly compact?: boolean;
}

export function ProfileQrShareCard({
  title,
  subtitle,
  path,
  badgeText = 'Official Digital Verification QR',
  description = 'Scan with any smartphone camera to view this verified public profile, credentials, and open opportunities.',
  downloadFileName,
  udyamOrAffiliation,
  locationText,
  isMsme,
  isInstitution,
  compact = false,
}: ProfileQrShareCardProps) {
  const { addToast } = useApp();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [fullUrl, setFullUrl] = useState<string>(`https://jobsclick.live${path}`);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      const url = `${origin}${path}`;
      setFullUrl(url);

      QRCode.toDataURL(url, {
        width: 512,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((dataUrl) => {
          setQrDataUrl(dataUrl);
        })
        .catch((err) => {
          console.error('Failed to generate QR code', err);
        });
    }
  }, [path]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      addToast({
        type: 'success',
        title: 'Profile Link Copied',
        message: 'Direct profile URL copied to clipboard.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({
        type: 'info',
        title: 'Copy Failed',
        message: 'Could not access clipboard. Please copy URL manually.',
      });
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title,
          text: `Check out ${title} on JobsClick National Portal:`,
          url: fullUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      await handleCopyLink();
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${downloadFileName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addToast({
      type: 'success',
      title: 'QR Code Downloaded',
      message: 'PNG file saved to your device.',
    });
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (compact) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR code for ${title}`}
              className="w-16 h-16 rounded-lg border border-gray-200 p-1 bg-white shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <QrCode className="w-6 h-6 text-gray-400 animate-pulse" />
            </div>
          )}
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-orange">
              {badgeText}
            </span>
            <p className="text-xs font-semibold text-gray-900 truncate max-w-[220px]">
              {title}
            </p>
            <p className="text-[11px] text-gray-500 font-mono truncate max-w-[220px]">
              {fullUrl}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="flex items-center gap-1 text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDownloadQr}
            className="flex items-center gap-1 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-gray-100">
        <div className="space-y-2 text-center md:text-left flex-1">
          <div className="inline-flex items-center gap-1 text-xs font-bold text-brand-orange bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
            <QrCode className="w-3.5 h-3.5" />
            <span>{badgeText}</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-600 font-medium">
              {subtitle}
            </p>
          )}
          <p className="text-xs text-gray-500 max-w-lg leading-relaxed pt-1">
            {description}
          </p>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-2 text-xs text-gray-600">
            {isMsme && (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Udyam Verified
              </span>
            )}
            {isInstitution && (
              <span className="inline-flex items-center gap-1 font-semibold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                <Award className="w-3.5 h-3.5 text-blue-600" />
                Accredited Institute
              </span>
            )}
            {udyamOrAffiliation && (
              <span className="font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                {udyamOrAffiliation}
              </span>
            )}
            {locationText && (
              <span className="text-gray-500">
                {locationText}
              </span>
            )}
          </div>
        </div>

        {/* High-res Scannable QR Display */}
        <div className="flex flex-col items-center gap-2.5 shrink-0 bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-xs">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Official QR Code for ${title}`}
              className="w-44 h-44 border-2 border-white rounded-xl shadow-xs p-1.5 bg-white"
            />
          ) : (
            <div className="w-44 h-44 rounded-xl bg-gray-200 animate-pulse flex items-center justify-center">
              <QrCode className="w-12 h-12 text-gray-400" />
            </div>
          )}
          <span className="text-[11px] text-gray-500 font-mono tracking-tight font-medium">
            Scan with Smartphone Camera
          </span>
        </div>
      </div>

      {/* Share Actions & Download Tools */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
        {/* URL Display Bar */}
        <div className="w-full sm:w-auto flex-1 flex items-center gap-2 bg-gray-50 px-3.5 py-2 rounded-xl border border-gray-200 text-xs">
          <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="font-mono text-gray-700 truncate select-all">{fullUrl}</span>
        </div>

        {/* Buttons Row */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 font-semibold text-xs"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-500" />
                <span>Copy Link</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNativeShare}
            className="flex items-center gap-1.5 font-semibold text-xs"
          >
            <Share2 className="w-3.5 h-3.5 text-gray-500" />
            <span>Share</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDownloadQr}
            className="flex items-center gap-1.5 font-semibold text-xs shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download QR (PNG)</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="flex items-center gap-1.5 font-semibold text-xs text-gray-700 hover:bg-gray-100"
            title="Print official poster for factory gate or campus board"
          >
            <Printer className="w-3.5 h-3.5 text-gray-500" />
            <span>Print Poster</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
