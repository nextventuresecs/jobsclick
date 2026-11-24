export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    status: 'ok',
    deploymentId: process.env['RAILWAY_DEPLOYMENT_ID'],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
