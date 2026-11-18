import { randomUUID, randomInt } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { UserRepository } from '../../src/database/repositories/user.repository.js';
import { ProfileRepository } from '../../src/database/repositories/profile.repository.js';
/** Explicit public-discovery prerequisite. Never used by runtime code. */
export async function publishEmployerFixture(app: NestFastifyApplication, id: string): Promise<void> {
 const users=app.get(UserRepository), profiles=app.get(ProfileRepository), now=new Date().toISOString();
 if (!await users.findById(id)) await users.save({id,phone:'8'+randomInt(100000000,999999999),email:null,role:'employer',status:'active',source:'public-test-fixture',created_at:now,updated_at:now});
 const existing=await profiles.findBusinessProfileByUserId(id);
 await profiles.saveBusinessProfile({...existing,id:existing?.id??randomUUID(),user_id:id,company_name:'Published fixture company',ownership_type:'Private Limited',company_size:'Small',sector:'Manufacturing',city:'Indore',district:'Indore',is_published:true,source:'public-test-fixture',created_at:now,updated_at:now});
}
