const mongoose = require('mongoose');

const webauthnCredentialSchema = new mongoose.Schema({
  credentialID: { type: String, required: true },
  publicKey: { type: String, required: true },
  counter: { type: Number, default: 0 },
  transports: { type: [String], default: [] },
  deviceType: { type: String, enum: ['singleDevice', 'multiDevice'], default: 'singleDevice' },
  backedUp: { type: Boolean, default: false },
  name: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null }
}, { _id: true });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passkey: { type: String, required: true },
  TornAPIKey: { type: String, required: true },
  type: { type: String, default: 'user' },
  id: { type: Number, required: true, unique: true },
  email: { type: String },
  webauthnCredentials: { type: [webauthnCredentialSchema], default: [] }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

let connectPromise = null;

async function connectSessionsDb(baseUri) {
  const sessionsUri = String(baseUri || '').endsWith('/sessions')
    ? String(baseUri)
    : `${baseUri}/sessions`;

  if (mongoose.connection.readyState === 1 && mongoose.connection.name === 'sessions') {
    return mongoose.connection;
  }

  if (!connectPromise) {
    connectPromise = mongoose.connect(sessionsUri);
  }

  try {
    return await connectPromise;
  } catch (error) {
    connectPromise = null;
    throw error;
  }
}

module.exports = {
  User,
  connectSessionsDb
};
