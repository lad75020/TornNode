module.exports = async function (socket, req) {
    socket.send(JSON.stringify({ session_active: Boolean(req.session && req.session.userId) }));
};
