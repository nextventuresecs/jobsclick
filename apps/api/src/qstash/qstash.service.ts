import { Injectable } from '@nestjs/common';
import { Client } from '@upstash/qstash';

export interface PublishTaskOptions {
  url: string;
  body: Record<string, unknown>;
  delaySeconds?: number;
  deduplicationId?: string;
  retries?: number;
}

@Injectable()
export class QstashService {
  private client: Client | null = null;
  private isTestMode = process.env['NODE_ENV'] === 'test' || !process.env['QSTASH_TOKEN'] || process.env['QSTASH_TOKEN'] === 'qstash_dummy_token';

  constructor() {
    const token = process.env['QSTASH_TOKEN'];
    if (token && token !== 'qstash_dummy_token') {
      this.client = new Client({
        token,
        baseUrl: process.env['QSTASH_URL'],
      });
    }
  }

  async publishTask(options: PublishTaskOptions): Promise<{ messageId: string; url: string; scheduled: boolean }> {
    if (this.isTestMode || !this.client) {
      const mockMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[QStash Service (Mock)] Dispatched task to ${options.url} (delay: ${options.delaySeconds || 0}s):`, options.body);
      return {
        messageId: mockMessageId,
        url: options.url,
        scheduled: true,
      };
    }

    const response = await this.client.publishJSON({
      url: options.url,
      body: options.body,
      delay: options.delaySeconds,
      deduplicationId: options.deduplicationId,
      retries: options.retries ?? 3,
    });

    return {
      messageId: response.messageId,
      url: response.url,
      scheduled: true,
    };
  }

  getClient(): Client | null {
    return this.client;
  }
}
