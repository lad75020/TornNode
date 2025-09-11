const crypto = require('crypto');

console.log('Generated Secret Key (Base64): ', crypto.randomBytes(32).toString('base64'));