const mongoose = require('mongoose');

const measurementProfileSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true }, // e.g. "Shirt", "Pant", "Suit"
    chest: { type: Number, default: 0 },
    waist: { type: Number, default: 0 },
    hips: { type: Number, default: 0 },
    shoulder: { type: Number, default: 0 },
    sleeve: { type: Number, default: 0 },
    length: { type: Number, default: 0 },
    neck: { type: Number, default: 0 },
    inseam: { type: Number, default: 0 },
    thigh: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

const customerSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    measurement_profiles: [measurementProfileSchema],
  },
  { timestamps: true }
);

// phone is unique per tenant, not globally
customerSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

// Full-text search index
customerSchema.index({ name: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
