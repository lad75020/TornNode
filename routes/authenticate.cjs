module.exports = async function (fastify, isTest) {
    const mongoose = require('mongoose');
    const jwt = require('jsonwebtoken');
    const userSchema = new mongoose.Schema({
        username: String,
        passkey: String,
        TornAPIKey: String,
        type: String,
        id: Number,
        email: String
    });

    const User = mongoose.model('User', userSchema);
    fastify.post('/authenticate',  async (req, reply) => {
        const { username, passkey } = req.body;
        
        const bcrypt = require('bcrypt');

        mongoose.connect(`${isTest?process.env.MONGODB_URI_TEST:process.env.MONGODB_URI}/sessions`);
 

        try {
            const user = await User.findOne({ username });

            if (user && await bcrypt.compare(passkey, user.passkey)) {
                req.session.username = username;
                req.session.TornAPIKey = user.TornAPIKey;
                req.session.userType = user.type;
                req.session.userID = user.id;
                await req.session.save();
                const payload = { userID: user.id, username };
                const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

                return reply.send({ success: true, token });
            } else {
                return reply.send({ success: false, message: 'Invalid credentials' });
            }

        } catch (error) {
            return reply.send({ success: false, message: error.message });
        }
    });
};