'use strict';

function noStore(reply) {
  return reply.header('Cache-Control', 'no-store, private, max-age=0').header('Pragma', 'no-cache').header('Expires', '0');
}

function guard({ authSessions }) {
  return async (request, reply) => {
    let result;
    try { result = await authSessions.validateAndRenew(request); } catch (_) { result = { ok: false }; }
    if (result.ok) return;
    return noStore(reply).code(302).header('Location', '/').send();
  };
}

module.exports = async function protectIndex(fastify) {
  const protectedGuard = guard(fastify);
  fastify.get('/public-bazaar', (request, reply) => noStore(reply).sendFile('index.html'));

  // @fastify/vite registers its built index.html as a static route in production.
  // Guard it at request time instead of declaring a competing /index.html route.
  fastify.addHook('onRequest', async (request, reply) => {
    const pathname = new URL(request.raw.url, 'http://localhost').pathname;
    if (pathname === '/index.html') return protectedGuard(request, reply);
  });

  for (const path of ['/chart', '/chart/*', '/memory', '/memory/*']) {
    fastify.get(path, { preHandler: protectedGuard }, (request, reply) => noStore(reply).sendFile('index.html'));
  }
};

module.exports.guard = guard;
module.exports.noStore = noStore;
