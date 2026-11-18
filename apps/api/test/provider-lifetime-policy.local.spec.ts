import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderLifetimePolicy } from '../src/auth/provider-lifetime-policy.js';
import { AppModule } from '../src/app.module.js';
let app: NestFastifyApplication | undefined;
afterEach(async()=>{await app?.close();app=undefined;vi.unstubAllEnvs();});
async function start(seconds: string) {
 vi.stubEnv('AUTH_PROVIDER','supabase');vi.stubEnv('SUPABASE_ACCESS_TOKEN_LIFETIME_SECONDS',seconds);
 const module=await Test.createTestingModule({imports:[AppModule]}).compile();
 app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
 await app.init();await app.getHttpAdapter().getInstance().ready();
}
describe('AUTH-01/06 provider lifetime startup and readiness',()=>{
 it.each(['901','3600','0','900.5','invalid',''])('fails startup for invalid configured lifetime %s',async value=>{
   await expect(start(value)).rejects.toThrow('AUTH_PROVIDER_LIFETIME_MISCONFIGURED');
 });
 it.each(['899','900'])('starts and becomes ready at %s seconds',async value=>{
   await start(value);const api=app!;expect((await api.inject({method:'GET',url:'/health/ready'})).statusCode).toBe(200);
 });
 it('readiness fails loudly when declared configuration drifts beyond 900 seconds',async()=>{
   await start('900');const api=app!;vi.stubEnv('SUPABASE_ACCESS_TOKEN_LIFETIME_SECONDS','901');
   const response=await api.inject({method:'GET',url:'/health/ready'});
   expect(response.statusCode).toBe(503);expect(response.body).toContain('AUTH_PROVIDER_LIFETIME_MISCONFIGURED');
 });
 it('latches an observed provider lifetime mismatch until restart and never masks it with a shorter token',async()=>{
  await start('900');const api=app!,policy=api.get(ProviderLifetimePolicy);
  policy.observeVerifiedLifetime(901);policy.observeVerifiedLifetime(899);
  expect((await api.inject({method:'GET',url:'/health/ready'})).statusCode).toBe(503);
 });

});
