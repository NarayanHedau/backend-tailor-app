const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// Full-text search index
customerSchema.index({ name: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
