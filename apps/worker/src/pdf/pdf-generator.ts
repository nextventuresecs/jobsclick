import { Font, renderToBuffer } from '@react-pdf/renderer';
import path from 'path';
import {
  ProfilePdfTemplate,
  EducationEntry,
  ExperienceEntry,
} from './templates/ProfilePdfTemplate.js';

export interface SeekerPdfData {
  seekerId: string;
  fullName: string;
  seekerType: string;
  city: string;
  state?: string;
  skills: string[];
  summary?: string;
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  verificationUrl?: string;
  updatedAt: number;
}

let fontsRegistered = false;

export function ensureDevanagariFontsRegistered(): void {
  if (fontsRegistered) return;
  try {
    const fontPkg = path.dirname(require.resolve('@fontsource/noto-sans-devanagari/package.json'));
    const regularFontPath = path.join(fontPkg, 'files', 'noto-sans-devanagari-devanagari-400-normal.woff');
    const boldFontPath = path.join(fontPkg, 'files', 'noto-sans-devanagari-devanagari-700-normal.woff');

    Font.register({
      family: 'Noto Sans Devanagari',
      fonts: [
        { src: regularFontPath, fontWeight: 400 },
        { src: boldFontPath, fontWeight: 700 },
      ],
    });
    fontsRegistered = true;
  } catch (err) {
    console.warn('[PdfGeneratorService] Warning: Could not register local Noto Sans Devanagari font:', err);
  }
}

export class Semaphore {
  private current: number = 0;
  private queue: Array<() => void> = [];

  constructor(public readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      });
    });
  }

  private release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  get active(): number {
    return this.current;
  }

  get waiting(): number {
    return this.queue.length;
  }
}

export class PdfGeneratorService {
  private cache = new Map<string, { buffer: Buffer; cachedAt: number }>();
  private readonly semaphore: Semaphore;

  constructor(maxConcurrency = 10) {
    this.semaphore = new Semaphore(maxConcurrency);
    ensureDevanagariFontsRegistered();
  }

  get activeConcurrency(): number {
    return this.semaphore.active;
  }

  get waitingConcurrency(): number {
    return this.semaphore.waiting;
  }

  async generateSeekerPdf(data: SeekerPdfData): Promise<{ buffer: Buffer; fromCache: boolean; generationTimeMs: number }> {
    const startTime = Date.now();

    // 1. Cache check: return instant cached buffer if available & fresher than updatedAt
    const cached = this.cache.get(data.seekerId);
    if (cached && cached.cachedAt >= data.updatedAt) {
      return {
        buffer: cached.buffer,
        fromCache: true,
        generationTimeMs: Date.now() - startTime,
      };
    }

    // 2. Strict FIFO Semaphore acquire (STF-09: bounded concurrency)
    const release = await this.semaphore.acquire();

    try {
      ensureDevanagariFontsRegistered();

      // Render vector React-PDF document
      const docElement = ProfilePdfTemplate({
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
      });

      const buffer = await renderToBuffer(docElement);

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
      release();
    }
  }

  clearCache(seekerId?: string): void {
    if (seekerId) {
      this.cache.delete(seekerId);
    } else {
      this.cache.clear();
    }
  }

  getCached(seekerId: string): Buffer | null {
    const item = this.cache.get(seekerId);
    return item ? item.buffer : null;
  }
}
