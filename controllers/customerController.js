const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const { customerSchema, measurementProfileSchema } = require('../utils/validators');

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res) => {
  const { error } = customerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  // Check if customer with same phone already exists
  const existing = await Customer.findOne({ phone: req.body.phone.trim() });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: `Customer with phone ${req.body.phone} already exists`,
      existingCustomer: existing,
    });
  }

  const customer = await Customer.create(req.body);
  res.status(201).json({ success: true, message: 'Customer created', data: customer });
};

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
const getCustomers = async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const query = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Customer.countDocuments(query);
  const customers = await Customer.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  // Attach order count and total spend for each customer
  const customerIds = customers.map((c) => c._id);
  const orderStats = await Order.aggregate([
    { $match: { customer_id: { $in: customerIds } } },
    {
      $group: {
        _id: '$customer_id',
        orderCount: { $sum: 1 },
        lastOrderDate: { $max: '$createdAt' },
      },
    },
  ]);
  const statsMap = {};
  orderStats.forEach((s) => { statsMap[s._id.toString()] = s; });

  const enriched = customers.map((c) => ({
    ...c,
    orderCount: statsMap[c._id.toString()]?.orderCount || 0,
    lastOrderDate: statsMap[c._id.toString()]?.lastOrderDate || null,
  }));

  res.json({
    success: true,
    data: enriched,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
  });
};

// @desc    Get customer by ID with order history
// @route   GET /api/customers/:id
// @access  Private
const getCustomerById = async (req, res) => {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

  // Fetch order history for this customer
  const orders = await Order.find({ customer_id: req.params.id })
    .sort({ createdAt: -1 })
    .lean();

  // Fetch invoices for those orders
  const orderIds = orders.map((o) => o._id);
  const invoices = await Invoice.find({ order_id: { $in: orderIds } }).lean();
  const invoiceMap = {};
  invoices.forEach((inv) => { invoiceMap[inv.order_id.toString()] = inv; });

  const ordersWithInvoice = orders.map((o) => ({
    ...o,
    invoice: invoiceMap[o._id.toString()] || null,
  }));

  // Calculate stats
  const totalSpent = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.advance_paid || 0), 0);

  res.json({
    success: true,
    data: {
      ...customer,
      orders: ordersWithInvoice,
      stats: {
        totalOrders: orders.length,
        totalSpent,
        totalPaid,
        pendingAmount: totalSpent - totalPaid,
      },
    },
  });
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
const updateCustomer = async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, message: 'Customer updated', data: customer });
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
const deleteCustomer = async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, message: 'Customer deleted' });
};

// ─── Measurement Profiles ──────────────────────────────────────────────────

// @desc    Add measurement profile to customer
// @route   POST /api/customers/:id/measurements
// @access  Private
const addMeasurementProfile = async (req, res) => {
  const { error } = measurementProfileSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

  customer.measurement_profiles.push(req.body);
  await customer.save();

  const profile = customer.measurement_profiles[customer.measurement_profiles.length - 1];
  res.status(201).json({ success: true, message: 'Measurement profile added', data: profile });
};

// @desc    Update measurement profile
// @route   PUT /api/customers/:id/measurements/:profileId
// @access  Private
const updateMeasurementProfile = async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

  const profile = customer.measurement_profiles.id(req.params.profileId);
  if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

  Object.assign(profile, req.body);
  await customer.save();

  res.json({ success: true, message: 'Profile updated', data: profile });
};

// @desc    Delete measurement profile
// @route   DELETE /api/customers/:id/measurements/:profileId
// @access  Private
const deleteMeasurementProfile = async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

  const profile = customer.measurement_profiles.id(req.params.profileId);
  if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

  profile.deleteOne();
  await customer.save();

  res.json({ success: true, message: 'Profile deleted' });
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  addMeasurementProfile,
  updateMeasurementProfile,
  deleteMeasurementProfile,
};
