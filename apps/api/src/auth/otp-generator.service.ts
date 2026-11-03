import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

@Injectable()
export class OtpGenerator {
  generate(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }
}
