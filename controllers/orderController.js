const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const { sendTrackingLink } = require('../services/notificationService');
const { orderSchema, itemStatusSchema } = require('../utils/validators');
const logger = require('../utils/logger');

// @desc    Create order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  const { error } = orderSchema.validate(req.body, { allowUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { customer_id, items, trial_date, delivery_date, notes } = req.body;

  const customer = await Customer.findById(customer_id);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

  const order = await Order.create({ customer_id, items, trial_date, delivery_date, notes });

  // Create associated invoice
  const totalAmount = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
  await Invoice.create({ order_id: order._id, total_amount: totalAmount });

  // Send tracking link via WhatsApp/SMS
  try {
    const trackingUrl = `${process.env.FRONTEND_URL}/track/${order.tracking_id}`;
    await sendTrackingLink(customer.phone, customer.name, order.order_number, trackingUrl);
  } catch (err) {
    logger.warn(`Failed to send tracking link: ${err.message}`);
  }

  const populatedOrder = await Order.findById(order._id).populate('customer_id').lean();
  res.status(201).json({ success: true, message: 'Order created successfully', data: populatedOrder });
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
const getOrders = async (req, res) => {
  const { status, search, page = 1, limit = 20, startDate, endDate } = req.query;
  const query = {};

  if (status) query.status = status;
  if (startDate || endDate) {
    query.order_date = {};
    if (startDate) query.order_date.$gte = new Date(startDate);
    if (endDate) query.order_date.$lte = new Date(endDate);
  }

  let orders;

  if (search) {
    // Search by order number
    query.$or = [{ order_number: { $regex: search, $options: 'i' } }];

    // Also search by customer phone
    const customers = await Customer.find({
      $or: [
        { phone: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ],
    }).select('_id');

    if (customers.length > 0) {
      query.$or.push({ customer_id: { $in: customers.map((c) => c._id) } });
    }
  }

  const total = await Order.countDocuments(query);
  orders = await Order.find(query)
    .populate('customer_id', 'name phone email')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  // Attach invoice info
  const orderIds = orders.map((o) => o._id);
  const invoices = await Invoice.find({ order_id: { $in: orderIds } }).lean();
  const invoiceMap = {};
  invoices.forEach((inv) => { invoiceMap[inv.order_id.toString()] = inv; });
  orders = orders.map((o) => ({ ...o, invoice: invoiceMap[o._id.toString()] || null }));

  res.json({
    success: true,
    data: orders,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
  });
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('customer_id', 'name phone email address')
    .lean();
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  const invoice = await Invoice.findOne({ order_id: order._id }).lean();
  res.json({ success: true, data: { ...order, invoice } });
};

// @desc    Update order
// @route   PUT /api/orders/:id
// @access  Private
const updateOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  const { trial_date, delivery_date, notes, status } = req.body;
  if (trial_date) order.trial_date = trial_date;
  if (delivery_date) order.delivery_date = delivery_date;
  if (notes !== undefined) order.notes = notes;
  if (status) order.status = status;

  await order.save();
  res.json({ success: true, message: 'Order updated', data: order });
};

// @desc    Update item status
// @route   PUT /api/orders/:orderId/items/:itemId/status
// @access  Private
const updateItemStatus = async (req, res) => {
  const { error } = itemStatusSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  const item = order.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

  item.status = req.body.status;
  await order.save(); // triggers progress recalculation

  res.json({ success: true, message: 'Item status updated', data: order });
};

// @desc    Upload cloth image for item
// @route   POST /api/orders/:orderId/items/:itemId/image
// @access  Private
const uploadItemImage = async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  const item = order.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

  if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });

  // Delete old image from Cloudinary
  if (item.cloth_image_public_id) {
    await deleteFromCloudinary(item.cloth_image_public_id);
  }

  const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype, 'tailor-cloths');
  item.cloth_image = result.secure_url;
  item.cloth_image_public_id = result.public_id;

  await order.save();
  res.json({ success: true, message: 'Image uploaded', data: { cloth_image: item.cloth_image } });
};

// @desc    Update measurements for item
// @route   PUT /api/orders/:orderId/items/:itemId/measurements
// @access  Private
const updateMeasurements = async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  const item = order.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

  item.measurements = { ...item.measurements.toObject(), ...req.body };
  await order.save();
  res.json({ success: true, message: 'Measurements updated', data: item.measurements });
};

// @desc    Get dashboard stats
// @route   GET /api/orders/stats
// @access  Private
const getDashboardStats = async (req, res) => {
  const [total, pending, inProgress, completed, delivered] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ status: 'PENDING' }),
    Order.countDocuments({ status: 'IN_PROGRESS' }),
    Order.countDocuments({ status: 'COMPLETED' }),
    Order.countDocuments({ status: 'DELIVERED' }),
  ]);

  const revenueData = await Invoice.aggregate([
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$total_amount' },
        totalCollected: { $sum: '$advance_paid' },
        totalPending: { $sum: '$pending_amount' },
      },
    },
  ]);

  const revenue = revenueData[0] || { totalRevenue: 0, totalCollected: 0, totalPending: 0 };

  // Recent orders
  const recentOrders = await Order.find()
    .populate('customer_id', 'name phone')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  res.json({
    success: true,
    data: {
      orders: { total, pending, inProgress, completed, delivered },
      revenue,
      recentOrders,
    },
  });
};

// @desc    Get upcoming deadlines (trials & deliveries) and overdue orders
// @route   GET /api/orders/deadlines
// @access  Private
const getDeadlines = async (req, res) => {
  const now = new Date();
  const activeStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];

  // Overdue orders: delivery_date passed but not delivered/cancelled
  const overdue = await Order.find({
    delivery_date: { $lt: now },
    status: { $in: activeStatuses },
  })
    .populate('customer_id', 'name phone')
    .sort({ delivery_date: 1 })
    .lean();

  // Upcoming trials in the next 14 days
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingTrials = await Order.find({
    trial_date: { $gte: now, $lte: in14Days },
    status: { $in: activeStatuses },
  })
    .populate('customer_id', 'name phone')
    .sort({ trial_date: 1 })
    .lean();

  // Upcoming deliveries in the next 14 days
  const upcomingDeliveries = await Order.find({
    delivery_date: { $gte: now, $lte: in14Days },
    status: { $in: activeStatuses },
  })
    .populate('customer_id', 'name phone')
    .sort({ delivery_date: 1 })
    .lean();

  // All orders with dates for calendar view (current month ± 1 month)
  const startOfRange = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfRange = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const calendarOrders = await Order.find({
    status: { $in: activeStatuses },
    $or: [
      { trial_date: { $gte: startOfRange, $lte: endOfRange } },
      { delivery_date: { $gte: startOfRange, $lte: endOfRange } },
    ],
  })
    .populate('customer_id', 'name phone')
    .sort({ delivery_date: 1 })
    .lean();

  res.json({
    success: true,
    data: {
      overdue,
      upcomingTrials,
      upcomingDeliveries,
      calendarOrders,
      summary: {
        overdueCount: overdue.length,
        upcomingTrialsCount: upcomingTrials.length,
        upcomingDeliveriesCount: upcomingDeliveries.length,
      },
    },
  });
};

// @desc    Get chart data (orders & revenue) for a custom date range
// @route   GET /api/orders/chart-data?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// @access  Private
const getChartData = async (req, res) => {
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Parse date range — default to last 12 months
  let start = req.query.startDate ? new Date(req.query.startDate) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  let end = req.query.endDate ? new Date(req.query.endDate) : now;

  // Ensure end covers the full day
  end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  // Auto-detect grouping: daily (<=62 days), monthly (<=730 days ~2 yrs), yearly (>730 days)
  let groupMode;
  if (diffDays <= 62) groupMode = 'daily';
  else if (diffDays <= 730) groupMode = 'monthly';
  else groupMode = 'yearly';

  // Build aggregation group _id based on mode
  let groupId;
  if (groupMode === 'daily') {
    groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
  } else if (groupMode === 'monthly') {
    groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
  } else {
    groupId = { year: { $year: '$createdAt' } };
  }

  const statusGroup = {
    totalOrders: { $sum: 1 },
    completed: { $sum: { $cond: [{ $in: ['$status', ['COMPLETED', 'DELIVERED']] }, 1, 0] } },
    pending: { $sum: { $cond: [{ $in: ['$status', ['PENDING', 'IN_PROGRESS']] }, 1, 0] } },
    cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
  };

  const matchStage = { $match: { createdAt: { $gte: start, $lte: end } } };

  const [ordersAgg, revenueAgg] = await Promise.all([
    Order.aggregate([
      matchStage,
      { $group: { _id: groupId, ...statusGroup } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
    Invoice.aggregate([
      matchStage,
      {
        $group: {
          _id: groupId,
          revenue: { $sum: '$total_amount' },
          collected: { $sum: '$advance_paid' },
          pending: { $sum: '$pending_amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
  ]);

  // Build full chart array filling empty slots with zeros
  const chartData = [];

  const makeEntry = (oData, rData, labels) => ({
    ...labels,
    totalOrders: oData?.totalOrders || 0,
    completed: oData?.completed || 0,
    pending: oData?.pending || 0,
    cancelled: oData?.cancelled || 0,
    revenue: rData?.revenue || 0,
    collected: rData?.collected || 0,
    pendingAmount: rData?.pending || 0,
  });

  if (groupMode === 'daily') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const oData = ordersAgg.find((o) => o._id.year === year && o._id.month === month && o._id.day === day);
      const rData = revenueAgg.find((r) => r._id.year === year && r._id.month === month && r._id.day === day);
      chartData.push(makeEntry(oData, rData, {
        label: `${day} ${monthNames[month - 1]} ${year}`,
        shortLabel: `${day} ${monthNames[month - 1]}`,
        fullLabel: `${dayNames[d.getDay()]}, ${day} ${monthNames[month - 1]} ${year}`,
      }));
    }
  } else if (groupMode === 'monthly') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth() + 1;
      const oData = ordersAgg.find((o) => o._id.year === year && o._id.month === month);
      const rData = revenueAgg.find((r) => r._id.year === year && r._id.month === month);
      chartData.push(makeEntry(oData, rData, {
        label: `${monthNames[month - 1]} ${year}`,
        shortLabel: monthNames[month - 1],
        fullLabel: `${monthNames[month - 1]} ${year}`,
      }));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      const oData = ordersAgg.find((o) => o._id.year === y);
      const rData = revenueAgg.find((r) => r._id.year === y);
      chartData.push(makeEntry(oData, rData, {
        label: `${y}`,
        shortLabel: `${y}`,
        fullLabel: `${y}`,
      }));
    }
  }

  res.json({ success: true, data: chartData, groupMode, range: { start, end, days: diffDays } });
};

// @desc    Delete order
// @route   DELETE /api/orders/:id
// @access  Private
const deleteOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  await Invoice.findOneAndDelete({ order_id: order._id });
  await order.deleteOne();
  res.json({ success: true, message: 'Order deleted' });
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  updateItemStatus,
  uploadItemImage,
  updateMeasurements,
  getDashboardStats,
  getDeadlines,
  getChartData,
  deleteOrder,
};
