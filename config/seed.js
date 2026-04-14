const User = require('../models/User');
const logger = require('../utils/logger');

const seedAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      // Pass plain password — the pre('save') hook in User model handles hashing
      await User.create({
        name: 'Admin',
        email: process.env.ADMIN_EMAIL || 'admin@tailorshop.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@123',
        role: 'admin',
      });
      logger.info('Default admin created');
    }
  } catch (error) {
    logger.error(`Seed error: ${error.message}`);
  }
};

module.exports = { seedAdmin };
