import { z } from 'zod';

const profileId = z.string().uuid();
/** Existing public profile routes use database-generated UUIDs; never contacts or legacy IDs. */
export const publicProfilePathSchema = z.string().refine(path => {
  const match = /^\/(?:company|institution)\/([^/?#]+)$/.exec(path);
  return Boolean(match && profileId.safeParse(match[1]).success);
}, 'PUBLIC_PROFILE_PATH_INVALID');
