import type { NextRequest } from 'next/server';
import { forwardBffRequest } from '@/lib/bff';

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  if (params.action !== 'preview' && params.action !== 'schedule') {
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
  }
  return forwardBffRequest(req, `/bulk/invites/${params.action}`);
}
