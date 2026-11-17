import type { NextRequest } from 'next/server';
import { forwardPrivate, privateError } from '@/lib/server-api';

const roots = new Set(['profiles', 'jobs', 'placement', 'bulk', 'wallet', 'institutions', 'admin', 'notifications', 'privacy', 'resume']);
type Context = { params: { path: string[] } };
async function handle(req: NextRequest, { params }: Context) {
  const segments = params.path;
  if (!segments?.length || !roots.has(segments[0]!) || segments.some((part) => !part || part === '.' || part === '..' || /[%\\/?#\u0000-\u001f]/.test(part))) return privateError('NOT_FOUND', 404);
  return forwardPrivate(req, segments.map(encodeURIComponent).join('/'));
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
