import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Receiver } from '@upstash/qstash';
import { FastifyRequest } from 'fastify';

@Injectable()
export class QstashSignatureGuard implements CanActivate {
  private receiver: Receiver | null = null;
  private isTestMode =
    process.env['NODE_ENV'] === 'test' ||
    !process.env['QSTASH_CURRENT_SIGNING_KEY'] ||
    process.env['QSTASH_CURRENT_SIGNING_KEY'] === 'sig_dummy_current_key';

  constructor() {
    const currentKey = process.env['QSTASH_CURRENT_SIGNING_KEY'];
    const nextKey = process.env['QSTASH_NEXT_SIGNING_KEY'] || currentKey;

    if (currentKey && currentKey !== 'sig_dummy_current_key') {
      this.receiver = new Receiver({
        currentSigningKey: currentKey,
        nextSigningKey: nextKey,
      });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const signature = request.headers['upstash-signature'] as string | undefined;

    // Test bypass / mock verification
    if (this.isTestMode) {
      if (signature === 'test_invalid_signature') {
        throw new UnauthorizedException('Invalid QStash signature');
      }
      return true;
    }

    if (!signature) {
      throw new UnauthorizedException('Missing upstash-signature header');
    }

    if (!this.receiver) {
      return true;
    }

    try {
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {});
      const isValid = await this.receiver.verify({
        signature,
        body: rawBody,
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid QStash signature');
      }
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Signature verification failed';
      throw new UnauthorizedException(`QStash signature verification failed: ${errorMsg}`);
    }
  }
}
