import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@indian-job-portal/database';
import { ServiceUnavailableException } from '@nestjs/common';
export function createSmsKnownNumberLookup(db: SupabaseClient<Database>) {
  return async (phone: string): Promise<boolean> => {
    if (!/^[6-9][0-9]{9}$/.test(phone)) return false;
    const { data, error } = await db.rpc('rpc_sms_phone_is_known', { p_phone: phone });
    if (error || typeof data !== 'boolean')
      throw new ServiceUnavailableException('AUTH_HOOK_ADMISSION_UNAVAILABLE');
    return data;
  };
}
