const Customer = require('../models/Customer');
const { customerSchema } = require('../utils/validators');

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res) => {
  const { error } = customerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

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

  res.json({
    success: true,
    data: customers,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
  });
};

// @desc    Get customer by ID
// @route   GET /api/customers/:id
// @access  Private
const getCustomerById = async (req, res) => {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
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

module.exports = { createCustomer, getCustomers, getCustomerById, updateCustomer, deleteCustomer };
