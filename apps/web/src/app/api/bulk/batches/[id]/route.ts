import type { NextRequest } from 'next/server';
import { forwardPrivate } from '@/lib/server-api';
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return forwardPrivate(req, 'bulk/batches/' + encodeURIComponent(params.id));
}
