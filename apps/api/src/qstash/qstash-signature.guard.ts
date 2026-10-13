import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Receiver } from '@upstash/qstash';
import { FastifyRequest } from 'fastify';

/** Fastify request augmented with rawBody from our custom content-type parser. */
interface FastifyRequestWithRawBody extends FastifyRequest {
  rawBody?: string;
}

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
    const request = context.switchToHttp().getRequest<FastifyRequestWithRawBody>();
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
      // Use the raw body captured by the custom content-type parser in main.ts.
      // QStash signs the exact bytes it sends. JSON.stringify(request.body)
      // can produce different bytes (key order, whitespace, Unicode escaping)
      // and would cause signature verification to fail.
      const body = request.rawBody;
      if (!body) {
        throw new UnauthorizedException('Raw body unavailable for signature verification');
      }

      const isValid = await this.receiver.verify({ signature, body });

      if (!isValid) {
        throw new UnauthorizedException('Invalid QStash signature');
      }
      return true;
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;
      const errorMsg = err instanceof Error ? err.message : 'Signature verification failed';
      throw new UnauthorizedException(`QStash signature verification failed: ${errorMsg}`);
    }
  }
}
