import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitException extends HttpException {
  public readonly retryAfter: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message,
        retryAfter: retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfter = retryAfterSeconds;
  }
}
