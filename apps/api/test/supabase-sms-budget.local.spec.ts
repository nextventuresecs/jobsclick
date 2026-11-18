import {randomBytes,randomUUID} from 'node:crypto';
import Redis from 'ioredis';
import {Webhook} from 'standardwebhooks';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {fixtureSmsHook} from './fixtures/sms-hook.js';
const redis=new Redis(process.env['REDIS_URL']!,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,commandTimeout:1000});
beforeAll(async()=>{await redis.connect();});afterAll(async()=>{await redis.quit();});
const secret=randomBytes(32).toString('base64'),signer=new Webhook(secret);
function event(phone='918765432109'){
 const raw=Buffer.from(JSON.stringify({user:{id:randomUUID(),phone},sms:{otp:'654321'}}));const id=randomUUID(),now=new Date();
 return {raw,headers:{'webhook-id':id,'webhook-timestamp':String(Math.floor(now.getTime()/1000)),'webhook-signature':signer.sign(id,now,raw)}};
}
function fixture(overrides:Record<string,unknown>={}){
 const send=vi.fn();const namespace='sms-budget-test:'+randomUUID();
 const policy={phoneHmacKey:randomBytes(32),phoneDailyLimit:10,cooldownSeconds:60,globalBudgetPaise:10,sendCostPaise:1,blockedPrefixes:[],...overrides};
 const hook=fixtureSmsHook({secret,redis,namespace,send,policy});return {hook,send,namespace,policy};
}
describe('AUTH-03 signed SMS-hook spend and number limits',()=>{
 it('opens the shared budget circuit before any send beyond the configured spend',async()=>{
  const {hook,send}=fixture({globalBudgetPaise:1});const first=event(),second=event('919123456780');
  await hook.handle(first.raw,first.headers);
  await expect(hook.handle(second.raw,second.headers)).rejects.toMatchObject({status:429,message:'AUTH_HOOK_BUDGET_EXHAUSTED'});
  expect(send).toHaveBeenCalledTimes(1);
 });
 it('applies a retryable cooldown rather than a daily hard lockout',async()=>{
  const {hook,send}=fixture({phoneDailyLimit:1});const first=event(),second=event();
  await hook.handle(first.raw,first.headers);
  await expect(hook.handle(second.raw,second.headers)).rejects.toMatchObject({status:429,response:{code:'AUTH_HOOK_COOLDOWN',alternatives:['email']}});
  expect(send).toHaveBeenCalledTimes(1);
 });
 it('enforces a cooldown independently of the daily cap',async()=>{
  const {hook,send}=fixture();const first=event(),second=event();
  await hook.handle(first.raw,first.headers);
  await expect(hook.handle(second.raw,second.headers)).rejects.toMatchObject({status:429,response:{code:'AUTH_HOOK_COOLDOWN',alternatives:['email']}});
  expect(send).toHaveBeenCalledTimes(1);
 });
 it('rejects configured blocked ranges before delivery',async()=>{
  const {hook,send}=fixture({blockedPrefixes:['876']});const request=event();
  await expect(hook.handle(request.raw,request.headers)).rejects.toMatchObject({status:400,message:'AUTH_HOOK_DESTINATION_DENIED'});
  expect(send).not.toHaveBeenCalled();
 });
 it('serializes different requests across independent server instances at the global ceiling',async()=>{
  const f=fixture({globalBudgetPaise:1});const other=new Redis(process.env['REDIS_URL']!,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,commandTimeout:1000});
  await other.connect();
  try{
   const second=fixtureSmsHook({secret,redis:other,namespace:f.namespace,send:f.send,policy:f.policy});
   const a=event(),b=event('919123456780');
   const results=await Promise.allSettled([f.hook.handle(a.raw,a.headers),second.handle(b.raw,b.headers)]);
   expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
   expect(results.filter(result=>result.status==='rejected').map(result=>result.reason.status)).toEqual([429]);
   expect(f.send).toHaveBeenCalledTimes(1);
  }finally{await other.quit();}
 });
 it('stores only HMAC phone keys and PII-free budget alerts, not contacts or OTPs',async()=>{
  const f=fixture({globalBudgetPaise:1});const request=event();await f.hook.handle(request.raw,request.headers);
  const keys=await redis.keys(f.namespace+':*');
  expect(keys.some(key=>key.includes('8765432109'))).toBe(false);
  expect(keys.filter(key=>key.includes(':phone:'))).toHaveLength(1);
  expect(keys.filter(key=>key.includes(':phone:')).every(key=>/:[0-9a-f]{64}$/.test(key))).toBe(true);
  for(const key of keys){
   const kind=await redis.type(key);
   if(kind==='string')expect((await redis.get(key))?.includes('654321')).toBe(false);
   if(kind==='stream'){
    const all=await redis.xrange(key,'-','+');
    expect(JSON.stringify(all)).not.toContain('8765432109');expect(JSON.stringify(all)).not.toContain('654321');
    const rows=all.filter(row=>row[1][1]==='spend-threshold');expect(rows).toHaveLength(1);
    expect(rows[0]![1]).toEqual(['kind','spend-threshold','used_paise','1','limit_paise','1']);
   }
  }
 });

});
