const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    company: { type: String, trim: true, default: '' },
    gst_number: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 'text', phone: 'text', company: 'text' });

module.exports = mongoose.model('Supplier', supplierSchema);
