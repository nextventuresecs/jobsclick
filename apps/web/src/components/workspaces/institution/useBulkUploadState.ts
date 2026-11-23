'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ParsedRow } from './BulkUploadModal';
import { uploadBulkRoster } from '@/lib/bulk-upload';
import { pollBatchStatus, previewInviteWave, queueInviteWave, type InvitePreview } from './institutionApi';

export function useBulkUploadState(
  institutionName: string,
  addToast: (t: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void
) {
  const t = useTranslations('InstitutionWorkspace');
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawCsvText, setRawCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<readonly ParsedRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSchedulingWave, setIsSchedulingWave] = useState(false);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'>('idle');
  const [batchMetrics, setBatchMetrics] = useState({ totalRows: 0, validRows: 0, errorRows: 0 });

  const handleDirectFileUpload = async (fileToUpload?: File) => {
    if (isUploading) return;
    const file = fileToUpload || selectedFile;
    if (!file) {
      addToast({ type: 'error', title: t('rosterUploadFailure'), message: t('rosterFileRequired') });
      return;
    }

    setIsUploading(true);
    setInvitePreview(null);
    setBatchMetrics({ totalRows: 0, validRows: 0, errorRows: 0 });
    setBatchStatus('uploading');
    setUploadStatusText(t('uploadingRoster'));

    try {
      const batchData = await uploadBulkRoster(institutionName, 'student', file);
      const newBatchId = batchData.id;
      setActiveBatchId(newBatchId);
      setBatchStatus('queued');
      setImportStep(3);
      addToast({
        type: 'success', title: t('rosterQueued'), message: t('rosterQueuedDescription'),
      });

      const pollInterval = setInterval(async () => {
        const statusData = await pollBatchStatus(newBatchId).catch(() => null);
        if (statusData) {
          setBatchMetrics({
            totalRows: statusData.totalRows || 0,
            validRows: statusData.validRows || 0,
            errorRows: statusData.errorRows || 0,
          });
          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setBatchStatus('completed');
            setIsUploading(false);
            const waveSize = Math.min(statusData.validRows || 0, 10_000);
            if (waveSize) {
              try {
                setInvitePreview(await previewInviteWave(newBatchId, waveSize));
              } catch {
                addToast({ type: 'error', title: t('waveHeading'), message: t('wavePreviewFailed') });
              }
            }
            addToast({ type: 'success', title: t('batchSuccessTitle'), message: t('batchSuccessDesc') });
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setBatchStatus('failed');
            setIsUploading(false);
            addToast({ type: 'error', title: t('rosterImportFailure'), message: t('rosterImportFailureDescription') });
          } else {
            setBatchStatus(statusData.status === 'processing' ? 'processing' : 'queued');
          }
        }
      }, 2000);
    } catch (err: unknown) {
      setIsUploading(false);
      setBatchStatus('failed');
      const message = err instanceof Error && err.message === 'BULK_AADHAAR_UNSUPPORTED'
        ? t('aadhaarColumnUnsupported')
        : t('rosterUploadFailure');
      addToast({ type: 'error', title: t('rosterUploadFailure'), message });
    }
  };

  const handleScheduleWave = async () => {
    if (!activeBatchId || !invitePreview || isSchedulingWave || batchStatus !== 'completed') return;
    setIsSchedulingWave(true);
    try {
      await queueInviteWave(activeBatchId, invitePreview);
      setImportStep(4);
    } catch {
      addToast({ type: 'error', title: t('waveHeading'), message: t('waveQueueFailed') });
    } finally {
      setIsSchedulingWave(false);
    }
  };

  return {
    importStep, setImportStep,
    rawCsvText, setRawCsvText,
    parsedRows, setParsedRows,
    selectedFile, setSelectedFile,
    isUploading, isSchedulingWave, invitePreview, uploadStatusText,
    activeBatchId, batchStatus, batchMetrics,
    handleDirectFileUpload, handleScheduleWave,
  };
}
