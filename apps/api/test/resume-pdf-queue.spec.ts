import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { describe, expect, it } from 'vitest';
import { QueueService } from '../src/queue/queue.service.js';

describe.skipIf(process.env['RUN_LIVE_REDIS'] !== 'true')('Resume publication over BullMQ', () => {
  it.each(['completed', 'failed'] as const)('coalesces pending jobs and allows regeneration after %s', async (terminal) => {
    const connection = new IORedis(process.env['REDIS_URL']!, { maxRetriesPerRequest: null });
    const name = `resume-queue-test-${randomUUID()}`;
    const queue = new Queue(name, { connection });
    const queueEvents = new QueueEvents(name, { connection });
    const publishers = [new QueueService(), new QueueService()];
    const resume = { seekerId: 'profile-fixture', fullName: 'Fixture', seekerType: 'student', city: '', skills: [] };
    // Use the production publication path against an isolated queue and real loopback Redis.
    for (const publisher of publishers) {
      Object.defineProperty(publisher, 'isMock', { value: false });
      publisher.pdfGeneratorQueue.add = queue.add.bind(queue);
    }
    let releaseJob!: () => void;
    const canFinish = new Promise<void>((resolve) => { releaseJob = resolve; });
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const worker = new Worker(name, async () => {
      notifyStarted();
      await canFinish;
      if (terminal === 'failed') throw new Error('fixture rendering failure');
    }, { connection, autorun: false });

    try {
      const jobs = await Promise.all(
        Array.from({ length: 12 }, (_, i) => publishers[i % 2]!.publishPdfJob(resume)),
      );
      expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
      expect(await queue.getWaitingCount()).toBe(1);

      const job = jobs[0]!;
      void worker.run();
      await started;
      const activePoll = await publishers[1]!.publishPdfJob(resume);
      expect(activePoll.id).toBe(job.id);
      expect(await queue.getWaitingCount()).toBe(0);
      const finished = job.waitUntilFinished(queueEvents, 10_000);
      releaseJob();
      if (terminal === 'failed') await expect(finished).rejects.toThrow('fixture rendering failure');
      else await expect(finished).resolves.toBeNull();
      await worker.close();

      const next = await publishers[1]!.publishPdfJob(resume);
      expect(next.id).not.toBe(job.id);
      expect(await queue.getWaitingCount()).toBe(1);
    } finally {
      releaseJob();
      await worker.close();
      await queueEvents.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await Promise.all(publishers.map((publisher) => publisher.onModuleDestroy()));
      await connection.quit();
    }
  }, 25_000);
});
