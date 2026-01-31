module.exports = async function (fastify, isTest, chartType) {
    fastify.get('/Utils', async (req, reply) => {
        if (!req.session.TornAPIKey )
            return reply.status(401).send('Invalid session');

        return reply.view('utils', {
            username: req.session.username,
            userType: req.session.userType,
            isTest,
            chartType
        });
    });
};