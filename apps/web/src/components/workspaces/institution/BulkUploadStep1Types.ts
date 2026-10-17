export interface ParsedRow {
  readonly rowNumber: number;
  readonly studentName: string;
  readonly rollNumber: string;
  readonly phone: string;
  readonly stream: string;
  readonly passingYear: string;
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

export interface BulkUploadState {
  importStep: 1 | 2 | 3 | 4;
  setImportStep: (s: 1 | 2 | 3 | 4) => void;
  rawCsvText: string;
  setRawCsvText: (val: string) => void;
  parsedRows: readonly ParsedRow[];
  setParsedRows: (rows: readonly ParsedRow[]) => void;
  selectedFile: File | null;
  setSelectedFile: (f: File | null) => void;
  isUploading: boolean;
  uploadStatusText: string;
  activeBatchId: string | null;
  batchStatus: 'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed';
  batchMetrics: { totalRows: number; validRows: number; errorRows: number };
}
