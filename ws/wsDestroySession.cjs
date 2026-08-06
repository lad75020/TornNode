'use strict';

module.exports = async function destroySession(socket, request, fastify) {
  try {
    await fastify.authSessions.destroy(request, { exceptSocket: socket });
    socket.send(JSON.stringify({ type: 'logout', ok: true }));
    socket.close(1000, 'logout');
  } catch (_) {
    try { socket.send(JSON.stringify({ type: 'auth', ok: false, error: 'unauthenticated' })); } catch {}
    try { socket.close(4401, 'unauthenticated'); } catch {}
  }
};
