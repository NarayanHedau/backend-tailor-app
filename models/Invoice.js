const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
    },
    invoice_number: { type: String, unique: true },
    total_amount: { type: Number, required: true, default: 0 },
    advance_paid: { type: Number, default: 0 },
    pending_amount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    payment_status: {
      type: String,
      enum: ['PAID', 'PARTIAL', 'PENDING'],
      default: 'PENDING',
    },
    payment_history: [
      {
        amount: Number,
        date: { type: Date, default: Date.now },
        note: String,
        method: { type: String, enum: ['CASH', 'CARD', 'UPI', 'BANK'], default: 'CASH' },
      },
    ],
  },
  { timestamps: true }
);

// Auto-calculate pending amount and payment status
invoiceSchema.pre('save', function (next) {
  this.pending_amount = Math.max(0, this.total_amount - this.advance_paid - this.discount);
  if (this.pending_amount === 0) this.payment_status = 'PAID';
  else if (this.advance_paid > 0) this.payment_status = 'PARTIAL';
  else this.payment_status = 'PENDING';
  next();
});

// Generate invoice number
invoiceSchema.pre('save', async function (next) {
  if (!this.invoice_number) {
    const count = await this.constructor.countDocuments();
    this.invoice_number = `INV-${String(count + 1).padStart(4, '0')}-${new Date().getFullYear()}`;
  }
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
