'use client';

import { useState } from 'react';
import type { ParsedRow } from './BulkUploadModal';
import {
  requestSignedUploadUrl,
  uploadFileToSignedUrl,
  registerBatchJob,
  pollBatchStatus,
} from './institutionApi';

const DEFAULT_CSV = `Student Name,Roll Number,Phone,Stream,Passing Year
Manish Kushwaha,0801ME221102,9826112233,"Mechanical Engineering (Diploma)",2026
Ankita Soni,0801EC221105,9893044556,"Electronics & Comm (Diploma)",2026
Sunil Solanki,0801IT221110,9111455667,"ITI Machinist & Fitter",2025
Pooja Rajput,0801EE221115,9752099881,"Electrical Engineering (Diploma)",2026
Rajendra Bheel,0801CS221120,9300188223,"Computer Science (B.Tech)",2026`;

export function useBulkUploadState(
  institutionName: string,
  addToast: (t: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void
) {
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawCsvText, setRawCsvText] = useState(DEFAULT_CSV);
  const [parsedRows, setParsedRows] = useState<readonly ParsedRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'>('idle');
  const [batchMetrics, setBatchMetrics] = useState({ totalRows: 0, validRows: 0, errorRows: 0 });

  const handleDirectFileUpload = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!file) {
      addToast({ type: 'error', title: 'No File Selected', message: 'Please select a CSV file to upload.' });
      return;
    }

    setIsUploading(true);
    setBatchStatus('uploading');
    setUploadStatusText(`Requesting signed URL for ${file.name}...`);
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

    try {
      const { signedUrl, storagePath } = await requestSignedUploadUrl(apiUrl, file.name);
      setUploadStatusText(`Uploading ${file.name} to storage...`);
      await uploadFileToSignedUrl(signedUrl, file);
      setUploadStatusText('Registering batch with background BullMQ queue...');
      const batchData = await registerBatchJob(apiUrl, institutionName, storagePath, file.name);
      const newBatchId = batchData.id;
      setActiveBatchId(newBatchId);
      setBatchStatus('queued');
      setImportStep(3);
      addToast({
        type: 'success', title: 'Bulk Import Queued',
        message: 'File uploaded. Background worker processing in 500-row chunks with zero SMS (Hard Invariant #2).',
      });

      const pollInterval = setInterval(async () => {
        const statusData = await pollBatchStatus(apiUrl, newBatchId);
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
            addToast({ type: 'success', title: 'Onboarding Completed', message: `Processed ${statusData.validRows} candidates.` });
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setBatchStatus('failed');
            setIsUploading(false);
            addToast({ type: 'error', title: 'Import Failed', message: statusData.failureReason || 'Worker encountered an error.' });
          } else {
            setBatchStatus('processing');
          }
        }
      }, 2000);
    } catch (err: unknown) {
      setIsUploading(false);
      setBatchStatus('failed');
      addToast({ type: 'error', title: 'Upload Failed', message: err instanceof Error ? err.message : 'Upload failed' });
    }
  };

  return {
    importStep, setImportStep,
    rawCsvText, setRawCsvText,
    parsedRows, setParsedRows,
    selectedFile, setSelectedFile,
    isUploading, uploadStatusText,
    activeBatchId, batchStatus, batchMetrics,
    handleDirectFileUpload,
  };
}
