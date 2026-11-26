import type { FastifyInstance } from 'fastify';
import { isProduction } from '@indian-job-portal/validation';

const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), interest-cohort=()';
const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

/**
 * Registers baseline HTTP security headers across all Fastify API responses
 * without clobbering CORS headers or Bull-Board dashboard assets.
 */
export function registerApiSecurityHeaders(fastify: FastifyInstance): void {
  fastify.addHook('onSend', async (req, reply, payload) => {
    const url = req.url.split('?')[0] || '';

    if (!reply.hasHeader('x-content-type-options')) {
      reply.header('X-Content-Type-Options', 'nosniff');
    }
    if (!reply.hasHeader('x-frame-options')) {
      reply.header('X-Frame-Options', 'DENY');
    }
    if (!reply.hasHeader('referrer-policy')) {
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
    if (!reply.hasHeader('permissions-policy')) {
      reply.header('Permissions-Policy', PERMISSIONS_POLICY);
    }
    if (!reply.hasHeader('x-dns-prefetch-control')) {
      reply.header('X-DNS-Prefetch-Control', 'off');
    }
    if (!reply.hasHeader('x-permitted-cross-domain-policies')) {
      reply.header('X-Permitted-Cross-Domain-Policies', 'none');
    }
    // Apply strict default-src 'none' on API JSON endpoints; Bull-Board UI serves HTML/JS/CSS
    const isBullBoardUi = url === '/admin/queues/ui' || url.startsWith('/admin/queues/ui/');
    if (!isBullBoardUi && !reply.hasHeader('content-security-policy')) {
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
    if (isProduction() && !reply.hasHeader('strict-transport-security')) {
      reply.header('Strict-Transport-Security', HSTS_HEADER);
    }

    return payload;
  });
}
