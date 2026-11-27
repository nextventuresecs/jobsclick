import type { NextRequest } from 'next/server';
import { forwardBffRequest } from '@/lib/bff';

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== 'preview' && action !== 'schedule') {
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
  }
  return forwardBffRequest(req, `/bulk/invites/${action}`);
}
