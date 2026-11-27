import { z } from 'zod';

/**
 * Canonical BullMQ queue registry shared between apps/api, Bull-Board, and apps/worker.
 * Keeping queue names and retry policies in one module prevents registry drift.
 */
export const QUEUE_NAMES = {
  BULK_IMPORT: 'bulk-import',
  INVITE_WAVE: 'invite-wave',
  PDF_GENERATOR: 'pdf-generator',
  BROADCAST: 'broadcast-queue',
  ALERTS: 'alerts-queue',
  PAYMENTS_RECONCILE: 'payments-reconcile',
  PAYMENTS_EXPIRE: 'payments-expire',
  PAYMENTS_REFUND: 'payments-refund',
  PAYMENTS_INVOICE_OUTBOX: 'payments-invoice-outbox',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const MVP_QUEUE_NAMES = [
  QUEUE_NAMES.BULK_IMPORT,
  QUEUE_NAMES.INVITE_WAVE,
  QUEUE_NAMES.PDF_GENERATOR,
] as const;

export const P2_PAYMENT_QUEUE_NAMES = [
  QUEUE_NAMES.PAYMENTS_RECONCILE,
  QUEUE_NAMES.PAYMENTS_EXPIRE,
  QUEUE_NAMES.PAYMENTS_REFUND,
  QUEUE_NAMES.PAYMENTS_INVOICE_OUTBOX,
] as const;

export const DEFAULT_BULLMQ_RETRY_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800, count: 5000 },
};

export const PAYMENTS_BULLMQ_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
};

export const generatePdfTaskPayloadSchema = z.object({
  seekerId: z.string().min(1).max(128),
  fullName: z.string().min(1).max(200),
  seekerType: z.string().min(1).max(64),
  city: z.string().max(120).default(''),
  skills: z.array(z.string().max(80)).max(100).default([]),
  updatedAt: z.number().int().nonnegative().optional(),
});

export type GeneratePdfTaskPayload = z.infer<typeof generatePdfTaskPayloadSchema>;
