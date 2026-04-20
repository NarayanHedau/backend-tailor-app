const Sale = require('../models/Sale');
const Product = require('../models/Product');

const createSale = async (req, res) => {
  const { customer_name, items } = req.body;
  if (!customer_name || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Customer name and at least one item are required' });
  }

  // Check stock availability
  for (const item of items) {
    const product = await Product.findById(item.product_id);
    if (!product) return res.status(404).json({ success: false, message: `Product not found: ${item.product_name}` });
    if (product.stock_quantity < item.quantity) {
      return res.status(400).json({ success: false, message: `Insufficient stock for "${product.name}". Available: ${product.stock_quantity} ${product.unit}` });
    }
  }

  const sale = await Sale.create(req.body);

  // Decrease product stock
  for (const item of sale.items) {
    await Product.findByIdAndUpdate(item.product_id, { $inc: { stock_quantity: -item.quantity } });
  }

  res.status(201).json({ success: true, message: 'Sale recorded', data: sale });
};

const getSales = async (req, res) => {
  const { search, sale_type, payment_status, page = 1, limit = 20, startDate, endDate } = req.query;
  const query = {};

  if (sale_type) query.sale_type = sale_type;
  if (payment_status) query.payment_status = payment_status;
  if (startDate || endDate) {
    query.sale_date = {};
    if (startDate) query.sale_date.$gte = new Date(startDate);
    if (endDate) query.sale_date.$lte = new Date(endDate);
  }
  if (search) {
    query.$or = [
      { bill_number: { $regex: search, $options: 'i' } },
      { customer_name: { $regex: search, $options: 'i' } },
      { customer_phone: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Sale.countDocuments(query);
  const sales = await Sale.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.json({ success: true, data: sales, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } });
};

const getSaleById = async (req, res) => {
  const sale = await Sale.findById(req.params.id).lean();
  if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
  res.json({ success: true, data: sale });
};

const recordPayment = async (req, res) => {
  const { amount, method } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Valid amount is required' });

  const sale = await Sale.findById(req.params.id);
  if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });

  sale.amount_paid += amount;
  if (method) sale.payment_method = method;
  await sale.save();

  res.json({ success: true, message: 'Payment recorded', data: sale });
};

const deleteSale = async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });

  // Restore stock
  for (const item of sale.items) {
    await Product.findByIdAndUpdate(item.product_id, { $inc: { stock_quantity: item.quantity } });
  }

  await sale.deleteOne();
  res.json({ success: true, message: 'Sale deleted' });
};

const getSaleStats = async (req, res) => {
  const stats = await Sale.aggregate([
    {
      $group: {
        _id: null,
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: '$total_amount' },
        totalReceived: { $sum: '$amount_paid' },
        totalDue: { $sum: '$balance_due' },
      },
    },
  ]);

  const result = stats[0] || { totalSales: 0, totalRevenue: 0, totalReceived: 0, totalDue: 0 };
  res.json({ success: true, data: result });
};

module.exports = { createSale, getSales, getSaleById, recordPayment, deleteSale, getSaleStats };
