const Product = require('../models/Product');

const createProduct = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Product name is required' });

  const product = await Product.create(req.body);
  res.status(201).json({ success: true, message: 'Product created', data: product });
};

const getProducts = async (req, res) => {
  const { search, category, page = 1, limit = 50, lowStock } = req.query;
  const query = {};

  if (search) query.name = { $regex: search, $options: 'i' };
  if (category) query.category = category;
  if (lowStock === 'true') query.$expr = { $lte: ['$stock_quantity', '$low_stock_alert'] };

  const total = await Product.countDocuments(query);
  const products = await Product.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

  res.json({ success: true, data: products, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } });
};

const getProductById = async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, data: product });
};

const updateProduct = async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, message: 'Product updated', data: product });
};

const deleteProduct = async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, message: 'Product deleted' });
};

module.exports = { createProduct, getProducts, getProductById, updateProduct, deleteProduct };
