import type { NextRequest } from 'next/server';
import { forwardBffRequest } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-f\d-]{36}$/i.test(params.id)) {
    return Response.json({ code: 'BULK_NOT_FOUND' }, { status: 404 });
  }
  return forwardBffRequest(req, `/bulk/batches/${params.id}`);
}
