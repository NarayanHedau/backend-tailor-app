require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.error('SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB: ${mongoose.connection.host}`);

    const existing = await User.findOne({ email: email.toLowerCase() });

    if (existing) {
      existing.role = 'superadmin';
      existing.password = password;
      existing.name = existing.name || 'Super Admin';
      await existing.save();
      console.log(`Updated existing user '${email}' to role=superadmin with the configured password.`);
    } else {
      await User.create({
        name: 'Super Admin',
        email,
        password,
        role: 'superadmin',
      });
      console.log(`Created superadmin '${email}'.`);
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
