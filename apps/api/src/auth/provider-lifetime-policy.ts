import { Injectable, ServiceUnavailableException, type OnModuleInit } from '@nestjs/common';
import { PROVIDER_ACCESS_LIFETIME_SECONDS } from './provider-time-policy.js';

export function assertDeclaredProviderLifetime(source: Record<string,string|undefined>): void {
 if (source['AUTH_PROVIDER'] !== 'supabase') return;
 const raw=source['SUPABASE_ACCESS_TOKEN_LIFETIME_SECONDS'];
 if (!raw || !/^[0-9]+$/.test(raw) || Number(raw)<1 || Number(raw)>PROVIDER_ACCESS_LIFETIME_SECONDS) {
   throw new ServiceUnavailableException('AUTH_PROVIDER_LIFETIME_MISCONFIGURED');
 }
}
/** This checks the deployment declaration, not a fabricated GoTrue /settings expiry field. */
@Injectable()
export class ProviderLifetimePolicy implements OnModuleInit {
 private drift=false;
 onModuleInit(): void { this.check(); }
 observeVerifiedLifetime(seconds: number): void {
   if (!Number.isInteger(seconds) || seconds<1 || seconds>PROVIDER_ACCESS_LIFETIME_SECONDS) this.drift=true;
 }
 check(): void {
   assertDeclaredProviderLifetime(process.env);
   if (this.drift) throw new ServiceUnavailableException('AUTH_PROVIDER_LIFETIME_MISCONFIGURED');
 }
}
