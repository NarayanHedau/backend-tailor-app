const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');

const createPurchase = async (req, res) => {
  const { supplier_id, items } = req.body;
  if (!supplier_id || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Supplier and at least one item are required' });
  }

  const supplier = await Supplier.findById(supplier_id);
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

  const purchase = await Purchase.create(req.body);

  // Update product stock (increase)
  for (const item of purchase.items) {
    await Product.findByIdAndUpdate(item.product_id, {
      $inc: { stock_quantity: item.quantity },
    });
  }

  const populated = await Purchase.findById(purchase._id).populate('supplier_id', 'name phone company').lean();
  res.status(201).json({ success: true, message: 'Purchase recorded', data: populated });
};

const getPurchases = async (req, res) => {
  const { search, payment_status, page = 1, limit = 20, startDate, endDate } = req.query;
  const query = {};

  if (payment_status) query.payment_status = payment_status;
  if (startDate || endDate) {
    query.purchase_date = {};
    if (startDate) query.purchase_date.$gte = new Date(startDate);
    if (endDate) query.purchase_date.$lte = new Date(endDate);
  }
  if (search) {
    query.$or = [
      { bill_number: { $regex: search, $options: 'i' } },
    ];
    const suppliers = await Supplier.find({ name: { $regex: search, $options: 'i' } }).select('_id');
    if (suppliers.length > 0) query.$or.push({ supplier_id: { $in: suppliers.map((s) => s._id) } });
  }

  const total = await Purchase.countDocuments(query);
  const purchases = await Purchase.find(query)
    .populate('supplier_id', 'name phone company')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.json({ success: true, data: purchases, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } });
};

const getPurchaseById = async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('supplier_id').lean();
  if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });
  res.json({ success: true, data: purchase });
};

const recordPayment = async (req, res) => {
  const { amount, method } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Valid amount is required' });

  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });

  purchase.amount_paid += amount;
  if (method) purchase.payment_method = method;
  await purchase.save();

  res.json({ success: true, message: 'Payment recorded', data: purchase });
};

const deletePurchase = async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });

  // Revert stock
  for (const item of purchase.items) {
    await Product.findByIdAndUpdate(item.product_id, { $inc: { stock_quantity: -item.quantity } });
  }

  await purchase.deleteOne();
  res.json({ success: true, message: 'Purchase deleted' });
};

// Business overview stats
const getPurchaseStats = async (req, res) => {
  const stats = await Purchase.aggregate([
    {
      $group: {
        _id: null,
        totalPurchases: { $sum: 1 },
        totalSpent: { $sum: '$total_amount' },
        totalPaid: { $sum: '$amount_paid' },
        totalDue: { $sum: '$balance_due' },
      },
    },
  ]);

  const result = stats[0] || { totalPurchases: 0, totalSpent: 0, totalPaid: 0, totalDue: 0 };
  res.json({ success: true, data: result });
};

// Chart data: spent vs received vs profit/loss with date range filter
// GET /api/purchases/business-chart?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
const getBusinessChartData = async (req, res) => {
  const Sale = require('../models/Sale');
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let start = req.query.startDate ? new Date(req.query.startDate) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  let end = req.query.endDate ? new Date(req.query.endDate) : now;
  end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  let groupMode;
  if (diffDays <= 62) groupMode = 'daily';
  else if (diffDays <= 730) groupMode = 'monthly';
  else groupMode = 'yearly';

  let groupId;
  if (groupMode === 'daily') {
    groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
  } else if (groupMode === 'monthly') {
    groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
  } else {
    groupId = { year: { $year: '$createdAt' } };
  }

  const matchStage = { $match: { createdAt: { $gte: start, $lte: end } } };

  const [purchaseAgg, saleAgg] = await Promise.all([
    Purchase.aggregate([
      matchStage,
      { $group: { _id: groupId, spent: { $sum: '$total_amount' }, paid: { $sum: '$amount_paid' } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
    Sale.aggregate([
      matchStage,
      { $group: { _id: groupId, revenue: { $sum: '$total_amount' }, received: { $sum: '$amount_paid' } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
  ]);

  const makeEntry = (pData, sData, labels) => {
    const spent = pData?.spent || 0;
    const received = sData?.received || 0;
    const revenue = sData?.revenue || 0;
    return { ...labels, spent, paid: pData?.paid || 0, revenue, received, profit: revenue - spent };
  };

  const chartData = [];

  if (groupMode === 'daily') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear(), month = d.getMonth() + 1, day = d.getDate();
      const pData = purchaseAgg.find((p) => p._id.year === year && p._id.month === month && p._id.day === day);
      const sData = saleAgg.find((s) => s._id.year === year && s._id.month === month && s._id.day === day);
      chartData.push(makeEntry(pData, sData, {
        label: `${day} ${monthNames[month - 1]} ${year}`,
        shortLabel: `${day} ${monthNames[month - 1]}`,
        fullLabel: `${dayNames[d.getDay()]}, ${day} ${monthNames[month - 1]} ${year}`,
      }));
    }
  } else if (groupMode === 'monthly') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
      const year = cursor.getFullYear(), month = cursor.getMonth() + 1;
      const pData = purchaseAgg.find((p) => p._id.year === year && p._id.month === month);
      const sData = saleAgg.find((s) => s._id.year === year && s._id.month === month);
      chartData.push(makeEntry(pData, sData, {
        label: `${monthNames[month - 1]} ${year}`,
        shortLabel: monthNames[month - 1],
        fullLabel: `${monthNames[month - 1]} ${year}`,
      }));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      const pData = purchaseAgg.find((p) => p._id.year === y);
      const sData = saleAgg.find((s) => s._id.year === y);
      chartData.push(makeEntry(pData, sData, { label: `${y}`, shortLabel: `${y}`, fullLabel: `${y}` }));
    }
  }

  res.json({ success: true, data: chartData, groupMode });
};

module.exports = { createPurchase, getPurchases, getPurchaseById, recordPayment, deletePurchase, getPurchaseStats, getBusinessChartData };
