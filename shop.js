const crypto = require('crypto');

function hashPassword(phoneNumber, defaultPassword) {
  const hash = crypto.createHash('sha256');
  hash.update(phoneNumber + defaultPassword);
  return hash.digest('hex');
}

console.log(hashPassword('555', '555').slice(0, 40));
