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

const seedSuperadmin = async () => {
  try {
    const superadminExists = await User.findOne({ role: 'superadmin' });
    if (superadminExists) return;

    const isProduction = process.env.NODE_ENV === 'production';
    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;

    if (!email || !password) {
      const msg =
        'SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set before first boot to seed the superadmin.';
      if (isProduction) {
        logger.error(msg + ' Refusing to seed a default superadmin.');
        return;
      }
      logger.warn(msg + ' Skipping superadmin seed.');
      return;
    }

    await User.create({
      name: 'Super Admin',
      email,
      password,
      role: 'superadmin',
    });

    logger.info('Superadmin created from SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD.');
  } catch (error) {
    logger.error(`Superadmin seed error: ${error.message}`);
  }
};

module.exports = { seedAdmin, seedSuperadmin };
