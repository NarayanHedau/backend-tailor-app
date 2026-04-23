const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');

const createSupplier = async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone are required' });

  const existing = await Supplier.findOne({ tenantId: req.tenantId, phone: phone.trim() });
  if (existing) return res.status(409).json({ success: false, message: 'Supplier with this phone already exists', existingSupplier: existing });

  const supplier = await Supplier.create({ ...req.body, tenantId: req.tenantId });
  res.status(201).json({ success: true, message: 'Supplier created', data: supplier });
};

const getSuppliers = async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const query = { tenantId: req.tenantId };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Supplier.countDocuments(query);
  const suppliers = await Supplier.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();

  // Attach purchase stats
  const supplierIds = suppliers.map((s) => s._id);
  const purchaseStats = await Purchase.aggregate([
    { $match: { tenantId: req.tenantId, supplier_id: { $in: supplierIds } } },
    { $group: { _id: '$supplier_id', totalPurchases: { $sum: 1 }, totalAmount: { $sum: '$total_amount' }, totalPaid: { $sum: '$amount_paid' } } },
  ]);
  const statsMap = {};
  purchaseStats.forEach((s) => { statsMap[s._id.toString()] = s; });

  const enriched = suppliers.map((s) => ({
    ...s,
    totalPurchases: statsMap[s._id.toString()]?.totalPurchases || 0,
    totalAmount: statsMap[s._id.toString()]?.totalAmount || 0,
    totalPaid: statsMap[s._id.toString()]?.totalPaid || 0,
    balanceDue: (statsMap[s._id.toString()]?.totalAmount || 0) - (statsMap[s._id.toString()]?.totalPaid || 0),
  }));

  res.json({ success: true, data: enriched, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } });
};

const getSupplierById = async (req, res) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

  const purchases = await Purchase.find({ tenantId: req.tenantId, supplier_id: req.params.id }).sort({ createdAt: -1 }).lean();
  const totalAmount = purchases.reduce((s, p) => s + p.total_amount, 0);
  const totalPaid = purchases.reduce((s, p) => s + p.amount_paid, 0);

  res.json({ success: true, data: { ...supplier, purchases, stats: { totalPurchases: purchases.length, totalAmount, totalPaid, balanceDue: totalAmount - totalPaid } } });
};

const updateSupplier = async (req, res) => {
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
  res.json({ success: true, message: 'Supplier updated', data: supplier });
};

const deleteSupplier = async (req, res) => {
  const supplier = await Supplier.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
  res.json({ success: true, message: 'Supplier deleted' });
};

module.exports = { createSupplier, getSuppliers, getSupplierById, updateSupplier, deleteSupplier };
