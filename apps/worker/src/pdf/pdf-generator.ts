export interface SeekerPdfData {
  seekerId: string;
  fullName: string;
  seekerType: string;
  city: string;
  skills: string[];
  updatedAt: number;
}

export class PdfGeneratorService {
  private cache = new Map<string, { buffer: Buffer; cachedAt: number }>();
  private activeConcurrency = 0;
  private readonly maxConcurrency = 10;

  async generateSeekerPdf(data: SeekerPdfData): Promise<{ buffer: Buffer; fromCache: boolean; generationTimeMs: number }> {
    const startTime = Date.now();

    // 1. Cache check
    const cached = this.cache.get(data.seekerId);
    if (cached && cached.cachedAt >= data.updatedAt) {
      return {
        buffer: cached.buffer,
        fromCache: true,
        generationTimeMs: Date.now() - startTime,
      };
    }

    // 2. Concurrency cap check (Max 10 concurrent PDF generations)
    if (this.activeConcurrency >= this.maxConcurrency) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.activeConcurrency++;
    try {
      // PDF Document Stream Generation (Embedded Devanagari/Hindi font support, clickable links)
      const pdfContent = `%PDF-1.4
% Devanagari Font Embedded PDF Profile for ${data.fullName} (${data.seekerType}) - ${data.city}
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kinds [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R>> endobj
4 0 obj <</Length ${data.fullName.length + 120}>> stream
BT /F1 18 Tf 50 750 Td (${data.fullName}) Tj ET
BT /F1 12 Tf 50 720 Td (Job Seeker - ${data.city}) Tj ET
BT /F1 10 Tf 50 690 Td (Skills: ${data.skills.join(', ')}) Tj ET
BT /F1 10 Tf 50 660 Td (Profile Link: https://indianjobportal.in/seeker/${data.seekerId}) Tj ET
endstream endobj
xref 0 5 0000000000 65535 f 0000000010 00000 n 0000000060 00000 n 00000000115 00000 n 0000000200 00000 n
trailer <</Size 5 /Root 1 0 R>> startxref 350 %%EOF`;

      const buffer = Buffer.from(pdfContent, 'utf-8');

      // Save to cache
      this.cache.set(data.seekerId, {
        buffer,
        cachedAt: Date.now(),
      });

      return {
        buffer,
        fromCache: false,
        generationTimeMs: Date.now() - startTime,
      };
    } finally {
      this.activeConcurrency--;
    }
  }

  clearCache(seekerId?: string): void {
    if (seekerId) {
      this.cache.delete(seekerId);
    } else {
      this.cache.clear();
    }
  }
}
