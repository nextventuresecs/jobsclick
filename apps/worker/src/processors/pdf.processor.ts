import { Job } from 'bullmq';
import { PdfGeneratorService, SeekerPdfData } from '../pdf/pdf-generator.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PdfJobData extends SeekerPdfData {
  shouldSimulateFailure?: boolean;
}

export interface PdfJobResult {
  seekerId: string;
  bufferLength: number;
  fromCache: boolean;
  generationTimeMs: number;
  storagePath?: string;
  status: 'completed' | 'failed';
}

export class PdfProcessor {
  private pdfService: PdfGeneratorService;
  private supabase: SupabaseClient | null = null;

  constructor() {
    this.pdfService = new PdfGeneratorService();
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  async process(job: Job<PdfJobData>): Promise<PdfJobResult> {
    const data = job.data;

    // Retry test simulation: fail until attempt 3 if requested
    if (data.shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient PDF rendering error for retry check (attempt ${job.attemptsMade + 1})`);
    }

    const { buffer, fromCache, generationTimeMs } = await this.pdfService.generateSeekerPdf({
      seekerId: data.seekerId,
      fullName: data.fullName,
      seekerType: data.seekerType,
      city: data.city,
      state: data.state,
      skills: data.skills || [],
      summary: data.summary,
      education: data.education,
      experience: data.experience,
      verificationUrl: data.verificationUrl,
      updatedAt: data.updatedAt || Date.now(),
    });

    let storagePath: string | undefined;
    if (this.supabase) {
      storagePath = `resumes/${data.seekerId}.pdf`;
      const { error: uploadError } = await this.supabase.storage
        .from('private')
        .upload(storagePath, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.warn(`[PdfProcessor] Supabase storage upload warning for ${data.seekerId}: ${uploadError.message}`);
      }
    }

    if (typeof job.updateProgress === 'function') {
      await job.updateProgress(100);
    }

    return {
      seekerId: data.seekerId,
      bufferLength: buffer.length,
      fromCache,
      generationTimeMs,
      storagePath,
      status: 'completed',
    };
  }
}

export const pdfProcessor = new PdfProcessor();
export const pdfGeneratorProcessor = (job: Job<PdfJobData>) => pdfProcessor.process(job);
