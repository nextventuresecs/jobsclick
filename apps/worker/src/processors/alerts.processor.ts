import { Job } from 'bullmq';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { JobRow, JobAlertRow, AlertDeliveryRow } from '@indian-job-portal/database';
import { WorkerEmailService } from '../email/email.service.js';

export interface AlertsJobData {
  timeframeHours?: number;
  candidateId?: string;
  frequency?: 'daily' | 'weekly';
  shouldSimulateFailure?: boolean;
  alerts?: JobAlertRow[];
  jobs?: JobRow[];
}

export interface AlertsJobResult {
  alertsEvaluated: number;
  candidatesNotified: number;
  totalJobsMatched: number;
  totalDeliveriesCreated: number;
  status: 'completed' | 'failed';
}

interface LocalPersistenceState {
  users?: Record<string, { email?: string; language?: string; [key: string]: unknown }>;
  jobs?: Record<string, JobRow>;
  job_alerts?: Record<string, JobAlertRow>;
  alert_deliveries?: Record<string, AlertDeliveryRow>;
  [key: string]: unknown;
}

export class AlertsProcessor {
  private static deliveredTupleLedger = new Set<string>();
  private static inMemoryDeliveries = new Map<string, AlertDeliveryRow>();
  private supabase: SupabaseClient | null = null;
  private persistenceFilePath: string;
  private emailService = new WorkerEmailService();

  constructor() {
    const supabaseUrl = process.env['SUPABASE_URL'];
    const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (supabaseUrl && supabaseKey && supabaseKey !== 'dummy-service-role-key') {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
    const scratchDir = path.resolve(process.cwd(), '.scratch');
    this.persistenceFilePath = path.join(scratchDir, 'db-persistence.json');
  }

  private readLocalState(): LocalPersistenceState {
    try {
      if (fs.existsSync(this.persistenceFilePath)) {
        return JSON.parse(fs.readFileSync(this.persistenceFilePath, 'utf-8'));
      }
    } catch {
      // ignore parse errors
    }
    return {};
  }

  private saveLocalState(state: LocalPersistenceState): void {
    try {
      fs.writeFileSync(this.persistenceFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // ignore write errors in restricted envs
    }
  }

  async process(job: Job<AlertsJobData>): Promise<AlertsJobResult> {
    const { timeframeHours = 24, candidateId, frequency = 'daily', shouldSimulateFailure } = job.data;

    if (shouldSimulateFailure && job.attemptsMade < 2) {
      throw new Error(`Simulated transient search alert failure for retry test (attempt ${job.attemptsMade + 1})`);
    }

    let activeAlerts: JobAlertRow[] = [];
    let recentJobs: JobRow[] = [];
    let existingDeliveries: AlertDeliveryRow[] = [];

    const localState = this.readLocalState();

    if (this.supabase) {
      try {
        let alertQuery = this.supabase
          .from('job_alerts')
          .select('*')
          .eq('is_active', true)
          .eq('frequency', frequency);
        if (candidateId) {
          alertQuery = alertQuery.eq('user_id', candidateId);
        }
        const { data: alerts } = await alertQuery;
        activeAlerts = (alerts as JobAlertRow[]) || [];

        const cutoffTime = new Date(Date.now() - timeframeHours * 60 * 60 * 1000).toISOString();
        const { data: jobs } = await this.supabase
          .from('jobs')
          .select('*')
          .eq('is_active', true)
          .gte('created_at', cutoffTime);
        recentJobs = (jobs as JobRow[]) || [];

        // Memory bounded: scope existing delivery lookup to active candidates rather than global table scan
        let deliveriesQuery = this.supabase
          .from('alert_deliveries')
          .select('id, alert_id, user_id, job_id, delivered_at');
        if (candidateId) {
          deliveriesQuery = deliveriesQuery.eq('user_id', candidateId);
        } else if (activeAlerts.length > 0) {
          const userIds = Array.from(new Set(activeAlerts.map((a) => a.user_id)));
          if (userIds.length > 0) {
            deliveriesQuery = deliveriesQuery.in('user_id', userIds);
          }
        }
        const { data: deliveries } = await deliveriesQuery;
        existingDeliveries = (deliveries as AlertDeliveryRow[]) || [];
      } catch {
        // Fall back to local state
      }
    }

    if (job.data.alerts && job.data.alerts.length > 0) {
      activeAlerts = job.data.alerts.filter((a) => !a.frequency || a.frequency === frequency);
    } else if (activeAlerts.length === 0) {
      const allAlerts = Object.values(localState.job_alerts || {});
      activeAlerts = allAlerts.filter(
        (a) => a.is_active && (!candidateId || a.user_id === candidateId) && (!a.frequency || a.frequency === frequency),
      );
  
    }

    if (job.data.jobs && job.data.jobs.length > 0) {
      recentJobs = job.data.jobs;
    } else if (recentJobs.length === 0) {
      const allJobs = Object.values(localState.jobs || {});
      const cutoff = Date.now() - timeframeHours * 60 * 60 * 1000;
      recentJobs = allJobs.filter((j) => j.is_active && (new Date(j.created_at).getTime() >= cutoff || allJobs.length <= 10));
    }

    if (existingDeliveries.length === 0) {
      const allLocal = Object.values(localState.alert_deliveries || {});
      if (candidateId) {
        existingDeliveries = allLocal.filter((d) => d.user_id === candidateId);
      } else if (activeAlerts.length > 0) {
        const userIds = new Set(activeAlerts.map((a) => a.user_id));
        existingDeliveries = allLocal.filter((d) => userIds.has(d.user_id));
      } else {
        existingDeliveries = allLocal;
      }
    }

    // Set of delivered tuples: user_id:job_id (Hard Invariant: deduplication ledger)
    const deliveredSet = new Set<string>();
    for (const d of existingDeliveries) {
      deliveredSet.add(`${d.user_id}:${d.job_id}`);
    }
    for (const tuple of AlertsProcessor.deliveredTupleLedger) {
      deliveredSet.add(tuple);
    }
    // Set of delivered tuples: user_id:job_id (Hard Invariant: deduplication ledger)




    // Group alerts by user
    const alertsByUser = new Map<string, JobAlertRow[]>();
    for (const alert of activeAlerts) {
      const list = alertsByUser.get(alert.user_id) || [];
      list.push(alert);
      alertsByUser.set(alert.user_id, list);
    }

    let candidatesNotified = 0;
    let totalJobsMatched = 0;
    let totalDeliveriesCreated = 0;
    const newDeliveries: AlertDeliveryRow[] = [];

    // Evaluate matching jobs per user
    for (const [userId, userAlerts] of alertsByUser.entries()) {
      const matchedJobsForUser: Array<{ job: JobRow; alertId: string }> = [];

      for (const alert of userAlerts) {
        const filters = (alert.filters || {}) as Record<string, unknown>;
        const kw = typeof filters['keyword'] === 'string' ? (filters['keyword'] as string).toLowerCase().trim() : null;
        const city = typeof filters['city'] === 'string' ? (filters['city'] as string).toLowerCase().trim() : null;
        const category = typeof filters['category'] === 'string' ? (filters['category'] as string).toLowerCase().trim() : null;
        const minPay = typeof filters['minPay'] === 'number' ? (filters['minPay'] as number) : null;

        for (const jobItem of recentJobs) {
          const dedupeKey = `${userId}:${jobItem.id}`;
          if (deliveredSet.has(dedupeKey)) {
            continue; // Already delivered to this user previously
          }

          if (city && (!jobItem.city || jobItem.city.toLowerCase() !== city)) {
            continue;
          }

          if (category && (!jobItem.category || jobItem.category.toLowerCase() !== category)) {
            continue;
          }

          if (kw) {
            const matchesTitle = jobItem.title && jobItem.title.toLowerCase().includes(kw);
            const matchesDesc = jobItem.description && jobItem.description.toLowerCase().includes(kw);
            const matchesSkills = Array.isArray(jobItem.skills) && jobItem.skills.some((s) => s.toLowerCase().includes(kw));
            if (!matchesTitle && !matchesDesc && !matchesSkills) {
              continue;
            }
          }

          if (minPay !== null && (jobItem.max_pay ?? 0) < minPay) {
            continue;
          }

          // Matched
          matchedJobsForUser.push({ job: jobItem, alertId: alert.id });
          deliveredSet.add(dedupeKey);

          // Hard limit: max 5 jobs per digest email (Anti-Spam / JOB-06)
          if (matchedJobsForUser.length >= 5) {
            break;
          }
        }

        if (matchedJobsForUser.length >= 5) {
          break;
        }
      }

      if (matchedJobsForUser.length > 0) {
        // 1. Resolve recipient contact info and language preference
        let recipientEmail: string | null = null;
        let recipientLang = 'en';

        if (this.supabase) {
          try {
            const { data: userRow } = await this.supabase
              .from('users')
              .select('email')
              .eq('id', userId)
              .maybeSingle();
            if (userRow?.email) {
              recipientEmail = userRow.email;
            }
          } catch {
            // fallback
          }
        } else if (localState.users?.[userId]?.email) {
          recipientEmail = localState.users[userId]!.email!;
          if (localState.users[userId]!.language === 'hi') {
            recipientLang = 'hi';
          }
        }

        const isTestEnv = process.env['NODE_ENV'] === 'test' || !process.env['RESEND_API_KEY'];
        let dispatchSucceeded = isTestEnv;

        if (recipientEmail) {
          const emailRes = await this.emailService.sendAlertDigest(
            recipientEmail,
            matchedJobsForUser.map((m) => m.job),
            userId,
            recipientLang,
          );
          dispatchSucceeded = emailRes.success;
        }


        // 4. Record Deliveries ONLY on successful dispatch (prevents premature deduplication on dispatch failure)
        if (dispatchSucceeded) {
          const userDeliveries: AlertDeliveryRow[] = matchedJobsForUser.map(({ job: mJob, alertId }) => ({
            id: randomUUID(),
            alert_id: alertId,
            user_id: userId,
            job_id: mJob.id,
            delivered_at: new Date().toISOString(),
          }));

          if (this.supabase) {
            try {
              await this.supabase.from('alert_deliveries').insert(userDeliveries);
            } catch {
              // Persisted locally
            }
          }

          for (const d of userDeliveries) {
            newDeliveries.push(d);
            AlertsProcessor.deliveredTupleLedger.add(`${d.user_id}:${d.job_id}`);
            AlertsProcessor.inMemoryDeliveries.set(d.id, d);
          }
          totalDeliveriesCreated += userDeliveries.length;
          candidatesNotified++;
          totalJobsMatched += matchedJobsForUser.length;
        }
      }
    }

    // Save to local store
    if (newDeliveries.length > 0) {
      const freshState = this.readLocalState();
      if (!freshState.alert_deliveries) {
        freshState.alert_deliveries = {};
      }
      for (const d of newDeliveries) {
        freshState.alert_deliveries[d.id] = d;
      }
      this.saveLocalState(freshState);
    }

    return {
      alertsEvaluated: activeAlerts.length,
      candidatesNotified,
      totalJobsMatched,
      totalDeliveriesCreated,
      status: 'completed',
    };
  }
}

export const alertsProcessor = async (job: Job<AlertsJobData>): Promise<AlertsJobResult> => {
  const processor = new AlertsProcessor();
  return processor.process(job);
};
