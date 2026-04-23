/**
 * One-time migration: assign tenantId = original-admin._id to all existing
 * shop records (Customer, Order, Invoice, Product, Supplier, Purchase, Sale)
 * that don't have one yet.
 *
 * Run once after deploying the multi-tenant refactor:
 *   node scripts/backfillTenantId.js
 *
 * Safe to run multiple times — it only updates records where tenantId is missing.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const Sale = require('../models/Sale');

const collections = [
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

    // Pick the owner for legacy data: prefer the configured ADMIN_EMAIL, else
    // fall back to the oldest user with role='admin'.
    let owner = null;
    if (process.env.ADMIN_EMAIL) {
      owner = await User.findOne({ email: process.env.ADMIN_EMAIL.toLowerCase().trim() });
    }
    if (!owner) {
      owner = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    }

    if (!owner) {
      console.error('No admin user found to assign legacy data to. Aborting.');
      process.exit(1);
    }

    console.log(`Assigning orphan records to: ${owner.email} (${owner._id})`);

    for (const { name, model } of collections) {
      const result = await model.updateMany(
        { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] },
        { $set: { tenantId: owner._id } }
      );
      console.log(`${name}: matched=${result.matchedCount ?? result.n}, modified=${result.modifiedCount ?? result.nModified}`);
    }

    console.log('\nBackfill complete.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill error:', err);
    process.exit(1);
  }
})();
