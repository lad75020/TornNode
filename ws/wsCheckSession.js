module.exports = async function ( socket, req) {
    const response = { session_active: true };

        if (!req.session.TornAPIKey )
            response.session_active = false;

        socket.send(JSON.stringify(response));
}
