import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueService } from '../src/queue/queue.service.js';

describe('BullMQ publication acknowledgements', () => {
  let service: QueueService;

  beforeEach(() => {
    vi.stubEnv('APP_ENV', 'test');
    service = new QueueService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    vi.unstubAllEnvs();
  });

  const publishers = [
    ['bulkImportQueue', (queue: QueueService) => queue.publishBulkImportJob({ batchId: 'batch-fixture', source: 'fixture' })],
    ['inviteWaveQueue', (queue: QueueService) => queue.publishInviteWaveJob({ waveId: 'wave-fixture', batchId: 'batch-fixture', waveSize: 1 })],
    ['pdfGeneratorQueue', (queue: QueueService) => queue.publishPdfJob({
      seekerId: 'profile-fixture', fullName: 'Synthetic Candidate', seekerType: 'student', city: 'Bhopal', skills: [],
    })],
    ['broadcastQueue', (queue: QueueService) => queue.publishBroadcastJob({
      campaignId: 'campaign-fixture', batchIndex: 0, totalBatches: 1, recipients: [], templateId: 'fixture', variables: {},
    })],
  ] as const;

  it.each(publishers)('%s reports broker rejection as unavailable in staging', async (queue, publish) => {
    const add = vi.spyOn(service[queue], 'add').mockRejectedValue(new Error('Redis lua cmsgpack unavailable'));
    Object.defineProperty(service, 'isMock', { value: false });
    vi.stubEnv('APP_ENV', 'staging');

    await expect(publish(service)).rejects.toMatchObject({ status: 503, response: { code: 'QUEUE_UNAVAILABLE' } });
    expect(add).toHaveBeenCalledOnce();
  });

  it.each(publishers)('%s can still acknowledge explicit test-mode jobs locally', async (queue, publish) => {
    const add = vi.spyOn(service[queue], 'add');

    await expect(publish(service)).resolves.toMatchObject({ id: expect.any(String) });
    expect(add).not.toHaveBeenCalled();
  });

  it('gives concurrent requests for one resume the same broker deduplication key', async () => {
    Object.defineProperty(service, 'isMock', { value: false });
    const queue = service.pdfGeneratorQueue;
    const add = vi.spyOn(queue, 'add').mockResolvedValue({} as Awaited<ReturnType<typeof queue.add>>);
    const resume = { seekerId: 'profile-a', fullName: 'Fixture', seekerType: 'student', city: '', skills: [] };
    await Promise.all([
      service.publishPdfJob({ ...resume, updatedAt: 1 }),
      service.publishPdfJob({ ...resume, updatedAt: 2 }),
      service.publishPdfJob({ ...resume, seekerId: 'profile-b' }),
    ]);
    expect(add.mock.calls.map(([, , options]) => options?.deduplication)).toEqual([
      { id: 'resume-profile-a' },
      { id: 'resume-profile-a' },
      { id: 'resume-profile-b' },
    ]);
  });
});
