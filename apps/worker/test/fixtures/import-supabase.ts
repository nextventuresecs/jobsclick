import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserRow, JobSeekerProfileRow } from '@indian-job-portal/database';

export function createMockSupabase() {
  const users: UserRow[] = [];
  const profiles: JobSeekerProfileRow[] = [];
  const businessProfiles: Array<Record<string, unknown>> = [];
  const invitations: Array<Record<string, unknown>> = [];
  const batches: Array<Record<string, unknown>> = [];
  const storageFiles = new Map<string, string>();

  let idCounter = 1;

  const client = {
    _users: users,
    _profiles: profiles,
    _businessProfiles: businessProfiles,
    _invitations: invitations,
    _batches: batches,
    _storageFiles: storageFiles,

    storage: {
      from: (_bucket: string) => ({
        download: async (path: string) => {
          if (!storageFiles.has(path)) {
            return { data: null, error: new Error(`File not found: ${path}`) };
          }
          const content = storageFiles.get(path)!;
          const blob = new Blob([content], { type: 'text/csv' });
          return { data: blob, error: null };
        },
        upload: async (path: string, content: string) => {
          storageFiles.set(path, content);
          return { data: { path }, error: null };
        },
      }),
    },

    from: (table: string) => {
      if (table === 'users') {
        return {
          select: (_cols?: string) => ({
            in: async (col: string, values: string[]) => {
              if (col === 'phone') {
                const matched = users.filter((u) => u.phone && values.includes(u.phone));
                return { data: matched.map((u) => ({ id: u.id, phone: u.phone, email: u.email })), error: null };
              }
              if (col === 'email') {
                const matched = users.filter((u) => u.email && values.includes(u.email));
                return { data: matched.map((u) => ({ id: u.id, phone: u.phone, email: u.email })), error: null };
              }
              return { data: [], error: null };
            },
          }),
          upsert: (items: Array<Partial<UserRow>>, _opts?: { onConflict?: string }) => ({
            select: async (_cols?: string) => {
              const upserted: UserRow[] = [];
              for (const item of items) {
                const existingIndex = users.findIndex(
                  (u) => (item.phone && u.phone === item.phone) || (item.email && u.email === item.email),
                );
                if (existingIndex >= 0) {
                  users[existingIndex] = {
                    ...users[existingIndex]!,
                    ...item,
                    updated_at: new Date().toISOString(),
                  };
                  upserted.push(users[existingIndex]!);
                } else {
                  const newUser: UserRow = {
                    id: `usr_${idCounter++}`,
                    phone: item.phone ?? null,
                    email: item.email ?? null,
                    role: item.role || 'job_seeker',
                    status: item.status || 'invited',
                    source: item.source || 'bulk_import',
                    created_by: null,
                    updated_by: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  users.push(newUser);
                  upserted.push(newUser);
                }
              }
              return { data: upserted.map((u) => ({ id: u.id, phone: u.phone, email: u.email })), error: null };
            },
          }),
        };
      }

      if (table === 'job_seeker_profiles') {
        return {
          select: (_cols?: string) => ({
            in: async (_col: string, userIds: string[]) => {
              const matched = profiles.filter((p) => userIds.includes(p.user_id));
              return { data: matched.map((p) => ({ id: p.id, user_id: p.user_id })), error: null };
            },
          }),
          insert: async (items: Array<Partial<JobSeekerProfileRow>>) => {
            for (const item of items) {
              profiles.push({
                id: `prof_${idCounter++}`,
                user_id: item.user_id!,
                full_name: item.full_name || 'Invited Candidate',
                photo_url: null,
                seeker_type: item.seeker_type || 'student',
                apaar_id: null,
                aadhaar_last_four: item.aadhaar_last_four ?? null,
                aadhaar_verified: item.aadhaar_verified ?? false,
                source: item.source || 'bulk_import',
                skills: item.skills || [],
                created_by: null,
                updated_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
            return { data: items, error: null };
          },
          update: (updates: Partial<JobSeekerProfileRow>) => ({
            eq: async (_col: string, id: string) => {
              const index = profiles.findIndex((p) => p.id === id);
              if (index >= 0) {
                profiles[index] = {
                  ...profiles[index]!,
                  ...updates,
                  updated_at: new Date().toISOString(),
                };
              }
              return { data: profiles[index] || null, error: null };
            },
          }),
        };
      }

      if (table === 'business_profiles') {
        return {
          select: (_cols?: string) => ({
            in: async (_col: string, userIds: string[]) => {
              const matched = businessProfiles.filter((p) => userIds.includes(p['user_id'] as string));
              return { data: matched.map((p) => ({ id: p['id'], user_id: p['user_id'] })), error: null };
            },
          }),
          insert: async (items: Array<Record<string, unknown>>) => {
            for (const item of items) {
              businessProfiles.push({
                id: `biz_${idCounter++}`,
                ...item,
              });
            }
            return { data: items, error: null };
          },
        };
      }

      if (table === 'invitations') {
        return {
          insert: async (items: Array<Record<string, unknown>>) => {
            for (const item of items) {
              invitations.push({
                id: `inv_${idCounter++}`,
                ...item,
              });
            }
            return { data: items, error: null };
          },
        };
      }

      if (table === 'bulk_import_batches') {
        return {
          update: (updates: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              batches.push({ id, ...updates });
              return { data: { id, ...updates }, error: null };
            },
          }),
        };
      }

      throw new Error(`Unexpected mock table: ${table}`);
    },
  };

  return client as unknown as SupabaseClient<Database> & {
    _users: UserRow[];
    _profiles: JobSeekerProfileRow[];
    _businessProfiles: Array<Record<string, unknown>>;
    _invitations: Array<Record<string, unknown>>;
    _batches: Array<Record<string, unknown>>;
    _storageFiles: Map<string, string>;
  };
}
