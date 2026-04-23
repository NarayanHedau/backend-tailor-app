const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    product_name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.01 },
    unit: { type: String, default: 'Meter' },
    unit_price: { type: Number, required: true, min: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bill_number: { type: String },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customer_name: { type: String, required: true },
    customer_phone: { type: String, default: '' },
    sale_type: {
      type: String,
      enum: ['RETAIL', 'WHOLESALE'],
      default: 'RETAIL',
    },
    items: [saleItemSchema],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total_amount: { type: Number, default: 0 },
    amount_paid: { type: Number, default: 0 },
    balance_due: { type: Number, default: 0 },
    payment_status: {
      type: String,
      enum: ['PAID', 'PARTIAL', 'UNPAID'],
      default: 'UNPAID',
    },
    payment_method: {
      type: String,
      enum: ['CASH', 'CARD', 'UPI', 'BANK'],
      default: 'CASH',
    },
    sale_date: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

// Per-tenant compound uniqueness for bill_number
saleSchema.index({ tenantId: 1, bill_number: 1 }, { unique: true, sparse: true });

// Auto-generate bill number (per-tenant sequence)
saleSchema.pre('save', async function (next) {
  if (!this.bill_number) {
    const count = await this.constructor.countDocuments({ tenantId: this.tenantId });
    this.bill_number = `SALE-${String(count + 1).padStart(4, '0')}`;
  }

  // Calculate totals
  this.subtotal = this.items.reduce((sum, item) => {
    item.total = item.quantity * item.unit_price;
    return sum + item.total;
  }, 0);
  this.total_amount = this.subtotal - this.discount + this.tax;
  this.balance_due = Math.max(0, this.total_amount - this.amount_paid);

  if (this.balance_due === 0 && this.total_amount > 0) this.payment_status = 'PAID';
  else if (this.amount_paid > 0) this.payment_status = 'PARTIAL';
  else this.payment_status = 'UNPAID';

  next();
});

module.exports = mongoose.model('Sale', saleSchema);
