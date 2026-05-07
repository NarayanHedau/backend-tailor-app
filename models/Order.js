const mongoose = require('mongoose');

const measurementSchema = new mongoose.Schema(
  {
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
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['Shirt', 'Pant', 'Suit', 'Kurta', 'Blouse', 'Dress', 'Jacket', 'Other'],
    },
    quantity: { type: Number, required: true, default: 1 },
    status: {
      type: String,
      enum: ['PENDING', 'STITCHING', 'READY'],
      default: 'PENDING',
    },
    measurements: { type: measurementSchema, default: () => ({}) },
    cloth_image: { type: String, default: '' },
    cloth_image_public_id: { type: String, default: '' },
    description: { type: String, default: '' },
    price: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    order_number: { type: String, index: true },
    tracking_id: { type: String, unique: true, index: true },
    order_date: { type: Date, default: Date.now },
    trial_date: { type: Date },
    delivery_date: { type: Date },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'CANCELLED'],
      default: 'PENDING',
    },
    items: [itemSchema],
    notes: { type: String, default: '' },
    progress: {
      completed: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Auto-calculate progress before saving
orderSchema.pre('save', function (next) {
  if (this.items && this.items.length > 0) {
    const total = this.items.length;
    const completed = this.items.filter((i) => i.status === 'READY').length;
    const percentage = Math.round((completed / total) * 100);
    this.progress = { completed, total, percentage };

    // Auto-update order status
    const hasStitching = this.items.some((i) => i.status === 'STITCHING');
    if (completed === 0 && !hasStitching) this.status = 'PENDING';
    else if (completed === total) this.status = 'COMPLETED';
    else this.status = 'IN_PROGRESS';
  }
  next();
});

// Per-tenant compound uniqueness for order_number
orderSchema.index({ tenantId: 1, order_number: 1 }, { unique: true, sparse: true });

// Generate order number (scoped per-tenant)
orderSchema.pre('save', async function (next) {
  if (!this.order_number) {
    const count = await this.constructor.countDocuments({ tenantId: this.tenantId });
    this.order_number = `ORD-${String(count + 1).padStart(4, '0')}-${Date.now().toString().slice(-4)}`;
  }
  if (!this.tracking_id) {
    const { generateTrackingId } = require('../utils/generateTrackingId');
    this.tracking_id = generateTrackingId();
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
