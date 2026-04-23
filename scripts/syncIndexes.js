/**
 * Re-syncs MongoDB indexes to match the current Mongoose schemas. Drops the old
 * globally-unique indexes on order_number / invoice_number / bill_number so
 * each tenant can have its own sequence.
 *
 * Safe to run multiple times.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');

const models = [
  { name: 'Customer', model: Customer },
  { name: 'Order', model: Order },
  { name: 'Invoice', model: Invoice },
  { name: 'Product', model: Product },
  { name: 'Supplier', model: Supplier },
  { name: 'Purchase', model: Purchase },
  { name: 'Sale', model: Sale },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB: ${mongoose.connection.host}`);

    for (const { name, model } of models) {
      console.log(`\n--- ${name} ---`);
      const before = (await model.collection.indexes()).map((i) => i.name);
      console.log('Before:', before);

      // syncIndexes() drops indexes not defined in the schema and creates new ones
      const result = await model.syncIndexes();
      console.log('Sync result:', result);

      const after = (await model.collection.indexes()).map((i) => i.name);
      console.log('After: ', after);
    }

    console.log('\nAll indexes synced.');
    process.exit(0);
  } catch (err) {
    console.error('Sync error:', err);
    process.exit(1);
  }
})();
