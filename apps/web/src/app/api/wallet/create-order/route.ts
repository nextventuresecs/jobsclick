import { NextRequest } from 'next/server';
import { forwardBffRequest } from '@/lib/bff';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return forwardBffRequest(req, '/wallet/recharge/create-order');
}
