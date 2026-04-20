const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Fabric', 'Thread', 'Button', 'Zipper', 'Lining', 'Accessory', 'Other'],
      default: 'Fabric',
    },
    unit: {
      type: String,
      enum: ['Meter', 'Yard', 'Piece', 'Roll', 'Kg', 'Set', 'Dozen'],
      default: 'Meter',
    },
    stock_quantity: { type: Number, default: 0 },
    purchase_price: { type: Number, default: 0 }, // avg cost per unit
    selling_price: { type: Number, default: 0 },
    low_stock_alert: { type: Number, default: 5 },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', category: 'text' });

module.exports = mongoose.model('Product', productSchema);
