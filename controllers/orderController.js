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
  deleteOrder,
};
