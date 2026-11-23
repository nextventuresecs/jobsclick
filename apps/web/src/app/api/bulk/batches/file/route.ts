import type { NextRequest } from 'next/server';
import { forwardBffRequest } from '@/lib/bff';

export async function POST(req: NextRequest) {
  return forwardBffRequest(req, '/bulk/batches/file', { multipart: true, timeoutMs: 60_000 });
}
