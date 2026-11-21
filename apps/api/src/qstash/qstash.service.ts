import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import { isTestEnv } from '@indian-job-portal/validation';

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
  private isTestMode = isTestEnv();

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
    if (this.isTestMode) {
      const mockMessageId = randomUUID();
      console.log(`[QStash Service (Mock)] Dispatched task to ${options.url} (delay: ${options.delaySeconds || 0}s):`, options.body);
      return {
        messageId: mockMessageId,
        url: options.url,
        scheduled: true,
      };
    }

    if (!this.client) {
      throw new ServiceUnavailableException('QStash client is not configured');
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

  async cancelMessage(messageId: string): Promise<boolean> {
    if (this.isTestMode) {
      console.log(`[QStash Service (Mock)] Cancelled message ${messageId}`);
      return true;
    }

    if (!this.client) {
      throw new ServiceUnavailableException('QStash client is not configured');
    }

    try {
      await this.client.messages.delete(messageId);
      return true;
    } catch {
      return false;
    }
  }

  getClient(): Client | null {
    return this.client;
  }
}
