import type { NextRequest } from 'next/server';
import { forwardPrivate } from '@/lib/server-api';
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const response = await forwardPrivate(req, 'bulk/batches/' + encodeURIComponent(params.id) + '/error-report');
  if (response.ok) response.headers.set('Content-Disposition', 'attachment; filename="bulk-' + encodeURIComponent(params.id) + '-errors.csv"');
  return response;
}
