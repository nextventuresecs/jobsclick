import { Injectable } from '@nestjs/common';
import { TurnstileVerifier } from '../../src/auth/turnstile.service.js';

@Injectable()
export class MockTurnstileVerifier extends TurnstileVerifier {
  private shouldPass = true;

  setShouldPass(pass: boolean): void {
    this.shouldPass = pass;
  }

  async verify(token?: string): Promise<boolean> {
    if (!token || token.trim() === '' || token === 'invalid-token' || token === 'fail-token') {
      return false;
    }
    return this.shouldPass;
  }
}
