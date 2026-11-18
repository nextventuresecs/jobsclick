import type { Database } from '../src/index.js';
// M1 permits an email-only invited row; CSV admission remains independently disabled.
export const invitedPhone: Database['public']['Tables']['users']['Row']['phone'] = null;
