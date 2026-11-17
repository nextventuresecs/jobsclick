import { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifyToken } from '@/lib/auth-session';
import { currentIdentity, forwardPrivate, privateError, validOrigin, readPrivateBody } from '@/lib/server-api';
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!verifyToken(token)) return privateError('AUTH_REQUIRED', 401);
  if (!validOrigin(req)) return privateError('AUTH_ORIGIN_INVALID', 403);
  try {
    const user = await currentIdentity(token);
    if (!user) return privateError('AUTH_REQUIRED', 401);
    if (!['admin', 'intermediary', 'msme_admin'].includes(user.role)) return privateError('BULK_ROLE_FORBIDDEN', 403);
    const body = JSON.parse(await readPrivateBody(req));
    const source = user.role === 'intermediary' ? 'Institution_' + user.id.slice(0, 8)
      : user.role === 'msme_admin' ? 'MSME_' + user.id.slice(0, 8) : body.source || 'Admin_' + user.id.slice(0, 8);
    const payload = { source, entityType: body.entityType || (user.role === 'msme_admin' ? 'employer' : 'student'),
      csvContent: body.csvContent, storagePath: body.storagePath, fileName: body.fileName };
    return forwardPrivate(new NextRequest(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(payload) }), 'bulk/batches');
  } catch (error) {
    if (error instanceof RangeError) return privateError('PAYLOAD_TOO_LARGE', 413);
    if (error instanceof SyntaxError) return privateError('INVALID_JSON', 400);
    return privateError('BULK_REQUEST_FAILED', 503);
  }
}
