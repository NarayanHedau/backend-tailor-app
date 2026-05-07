const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    channel: { type: String, enum: ['whatsapp', 'sms'], required: true },
    to: { type: String, required: true },
    type: { type: String, default: 'order_confirmation' },
    status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true },
    providerMessageId: { type: String },
    errorMessage: { type: String },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

messageLogSchema.index({ tenantId: 1, sentAt: -1 });

module.exports = mongoose.model('MessageLog', messageLogSchema);
