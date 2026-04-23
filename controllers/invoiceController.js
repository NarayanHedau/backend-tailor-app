const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const { invoiceSchema, paymentSchema } = require('../utils/validators');

// @desc    Create / update invoice
// @route   POST /api/invoices
// @access  Private
const createInvoice = async (req, res) => {
  const { error } = invoiceSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { order_id, total_amount, advance_paid, discount } = req.body;

  const order = await Order.findOne({ _id: order_id, tenantId: req.tenantId });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  let invoice = await Invoice.findOne({ tenantId: req.tenantId, order_id });

  if (invoice) {
    invoice.total_amount = total_amount;
    invoice.advance_paid = advance_paid || 0;
    invoice.discount = discount || 0;
    await invoice.save();
    return res.json({ success: true, message: 'Invoice updated', data: invoice });
  }

  invoice = await Invoice.create({
    tenantId: req.tenantId,
    order_id,
    total_amount,
    advance_paid: advance_paid || 0,
    discount: discount || 0,
  });
  res.status(201).json({ success: true, message: 'Invoice created', data: invoice });
};

// @desc    Get invoice by order ID
// @route   GET /api/invoices/order/:orderId
// @access  Private
const getInvoiceByOrder = async (req, res) => {
  const invoice = await Invoice.findOne({ tenantId: req.tenantId, order_id: req.params.orderId })
    .populate({
      path: 'order_id',
      populate: { path: 'customer_id', select: 'name phone email' },
    })
    .lean();

  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
  res.json({ success: true, data: invoice });
};

// @desc    Record a payment
// @route   POST /api/invoices/:id/payment
// @access  Private
const recordPayment = async (req, res) => {
  const { error } = paymentSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const { amount, note, method } = req.body;

  if (amount > invoice.pending_amount) {
    return res.status(400).json({ success: false, message: 'Payment exceeds pending amount' });
  }

  invoice.advance_paid += amount;
  invoice.payment_history.push({ amount, note, method });
  await invoice.save(); // triggers recalculation

  res.json({ success: true, message: 'Payment recorded', data: invoice });
};

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
const getAllInvoices = async (req, res) => {
  const { payment_status, page = 1, limit = 20 } = req.query;
  const query = { tenantId: req.tenantId };
  if (payment_status) query.payment_status = payment_status;

  const total = await Invoice.countDocuments(query);
  const invoices = await Invoice.find(query)
    .populate({ path: 'order_id', populate: { path: 'customer_id', select: 'name phone' } })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.json({
    success: true,
    data: invoices,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
  });
};

module.exports = { createInvoice, getInvoiceByOrder, recordPayment, getAllInvoices };
