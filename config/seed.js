const User = require('../models/User');
const logger = require('../utils/logger');

const DEV_DEFAULT_EMAIL = 'admin@example.com';
const DEV_DEFAULT_PASSWORD = 'ChangeMe123!';

const seedAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) return;

    const isProduction = process.env.NODE_ENV === 'production';
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (isProduction && (!email || !password)) {
      logger.error(
        'ADMIN_EMAIL and ADMIN_PASSWORD must be set in production before first boot. ' +
          'Refusing to seed a default admin user.'
      );
      return;
    }

    const seedEmail = email || DEV_DEFAULT_EMAIL;
    const seedPassword = password || DEV_DEFAULT_PASSWORD;

    await User.create({
      name: 'Admin',
      email: seedEmail,
      password: seedPassword,
      role: 'admin',
    });

    if (!email || !password) {
      logger.warn(
        `Default admin created with development credentials (${seedEmail}). ` +
          'Change the password immediately or set ADMIN_EMAIL / ADMIN_PASSWORD in your .env file.'
      );
    } else {
      logger.info('Default admin created from ADMIN_EMAIL / ADMIN_PASSWORD.');
    }
  } catch (error) {
    logger.error(`Seed error: ${error.message}`);
  }
};

module.exports = { seedAdmin };
