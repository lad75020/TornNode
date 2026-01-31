/* eslint-disable no-empty */
module.exports = async function (fastify) {
  function isAuthed(req) {
    if (req.session && req.session.TornAPIKey) return true;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        fastify.jwt.verify(auth.slice(7));
        return true;
      } catch {}
    }
    return false;
  }

  // Public SPA route: allow public-bazaar without auth, serve SPA index
  fastify.get('/public-bazaar', {}, (req, reply) => {
    reply
      .header('Cache-Control', 'no-store, private, max-age=0')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .sendFile('index.html');
  });

  // Route protégée explicite
  fastify.get('/index.html', {
    preHandler: (req, reply, done) => {
      if (!isAuthed(req)) {
        return reply.code(302)
          .header('Cache-Control', 'no-store, private, max-age=0')
          .header('Pragma', 'no-cache')
          .header('Expires', '0')
          .header('Location', '/')
          .send();
      }
      done();
    }
  }, (req, reply) => {
    reply
      .header('Cache-Control', 'no-store, private, max-age=0')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .sendFile('index.html');
  });

  // SPA routes (chart) protégées pareil
  const spaPaths = ['/chart', '/chart/*', '/memory', '/memory/*'];
  for (const p of spaPaths) {
    fastify.get(p, {
      preHandler: (req, reply, done) => {
        if (!isAuthed(req)) {
          return reply.code(302)
            .header('Cache-Control', 'no-store, private, max-age=0')
            .header('Location', '/')
            .send();
        }
        done();
      }
    }, (req, reply) => {
      reply
        .header('Cache-Control', 'no-store, private, max-age=0')
        .sendFile('index.html');
    });
  }
};
