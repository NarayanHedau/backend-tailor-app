const crypto = require('crypto');

const generateTrackingId = () => {
  // 8-character alphanumeric uppercase ID e.g. "A3F9K2M1"
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

module.exports = { generateTrackingId };
