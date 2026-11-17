import type { NextRequest } from 'next/server';
import { forwardPrivate } from '@/lib/server-api';
export async function POST(req: NextRequest) { return forwardPrivate(req, 'bulk/signed-url'); }
