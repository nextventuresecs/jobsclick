import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/**
 * Protects Bull-Board UI and administrative queue endpoints using a dedicated
 * ADMIN_DASHBOARD_SECRET header credential (strictly separated from JWT_SECRET).
 */
export function registerAdminQueueGuard(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0] || '';
    if (url !== '/admin/queues' && !url.startsWith('/admin/queues/')) {
      return;
    }

    const authHeader = req.headers['authorization'];
    const secret = process.env['ADMIN_DASHBOARD_SECRET']?.trim();

    if (!authHeader) {
      reply.code(401).send({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Authentication required for administrative queue dashboard',
      });
      return;
    }

    let authorized = false;
    if (secret && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const tokenBuf = Buffer.from(token, 'utf-8');
      const secretBuf = Buffer.from(secret, 'utf-8');
      if (tokenBuf.length === secretBuf.length && crypto.timingSafeEqual(tokenBuf, secretBuf)) {
        authorized = true;
      }
    }

    if (!authorized) {
      reply.code(403).send({
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Insufficient administrative privileges to access queue dashboard',
      });
      return;
    }
  });
}
