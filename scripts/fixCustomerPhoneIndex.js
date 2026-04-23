/**
 * The Customer.phone field used to have a global unique index. After
 * multi-tenancy, uniqueness is compound (tenantId + phone). This script drops
 * the old single-field unique index so two tenants can have customers with the
 * same phone number.
 *
 * Safe to run multiple times.
 */

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB: ${mongoose.connection.host}`);

    const customers = mongoose.connection.collection('customers');
    const indexes = await customers.indexes();
    console.log('Current customer indexes:', indexes.map((i) => i.name));

    for (const idx of indexes) {
      const keys = Object.keys(idx.key || {});
      if (keys.length === 1 && keys[0] === 'phone') {
        console.log(`Dropping old single-field index: ${idx.name}`);
        await customers.dropIndex(idx.name);
      }
    }

    // Let mongoose re-sync schema indexes (creates the compound one if missing)
    const Customer = require('../models/Customer');
    await Customer.syncIndexes();
    console.log('Customer indexes synced.');

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
