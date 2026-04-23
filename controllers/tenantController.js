const crypto = require('crypto');
const User = require('../models/User');

// Generate a readable 12-char password: 8 random base64 chars + "A1!" suffix
// (bcrypt 10 rounds + min 6 enforced by schema).
const generatePassword = () => {
  const random = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 8);
  return `${random}A1!`;
};

const toTenantView = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  shopName: user.shopName || '',
  phone: user.phone || '',
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// @desc    Create a tailor tenant (superadmin only)
// @route   POST /api/tenants
const createTenant = async (req, res) => {
  const { name, email, shopName, phone, password } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'name and email are required' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: `A user with email ${normalizedEmail} already exists`,
    });
  }

  const plainPassword = password && String(password).length >= 6 ? String(password) : generatePassword();

  const tenant = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: plainPassword,
    shopName: shopName ? String(shopName).trim() : undefined,
    phone: phone ? String(phone).trim() : undefined,
    role: 'tailor',
    isActive: true,
    createdBy: req.user?._id,
  });

  // Return the generated password ONCE so the superadmin can share it with
  // the tailor (email delivery to be wired up later).
  res.status(201).json({
    success: true,
    message: 'Tailor tenant created',
    data: { ...toTenantView(tenant), generatedPassword: plainPassword },
  });
};

// @desc    List all tailor tenants
// @route   GET /api/tenants
const getTenants = async (req, res) => {
  const { search } = req.query;
  const query = { role: 'tailor' };

  if (search) {
    const rx = { $regex: String(search).trim(), $options: 'i' };
    query.$or = [{ name: rx }, { email: rx }, { shopName: rx }, { phone: rx }];
  }

  const tenants = await User.find(query).sort({ createdAt: -1 });
  res.json({ success: true, data: tenants.map(toTenantView) });
};

// @desc    Get a single tailor tenant
// @route   GET /api/tenants/:id
const getTenantById = async (req, res) => {
  const tenant = await User.findOne({ _id: req.params.id, role: 'tailor' });
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }
  res.json({ success: true, data: toTenantView(tenant) });
};

// @desc    Update a tailor tenant
// @route   PUT /api/tenants/:id
const updateTenant = async (req, res) => {
  const tenant = await User.findOne({ _id: req.params.id, role: 'tailor' });
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }

  const { name, email, shopName, phone, password, isActive } = req.body || {};

  if (email && email.toLowerCase().trim() !== tenant.email) {
    const normalizedEmail = email.toLowerCase().trim();
    const clash = await User.findOne({ email: normalizedEmail, _id: { $ne: tenant._id } });
    if (clash) {
      return res.status(409).json({
        success: false,
        message: `Email ${normalizedEmail} is already in use`,
      });
    }
    tenant.email = normalizedEmail;
  }

  if (name !== undefined) tenant.name = String(name).trim();
  if (shopName !== undefined) tenant.shopName = String(shopName).trim();
  if (phone !== undefined) tenant.phone = String(phone).trim();
  if (typeof isActive === 'boolean') tenant.isActive = isActive;

  let passwordChanged = false;
  if (password && String(password).length >= 6) {
    tenant.password = String(password);
    passwordChanged = true;
  }

  await tenant.save();
  res.json({
    success: true,
    message: passwordChanged ? 'Tailor tenant updated (password changed)' : 'Tailor tenant updated',
    data: toTenantView(tenant),
  });
};

// @desc    Toggle active status
// @route   PATCH /api/tenants/:id/status
const toggleTenantStatus = async (req, res) => {
  const tenant = await User.findOne({ _id: req.params.id, role: 'tailor' });
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }

  const { isActive } = req.body || {};
  tenant.isActive = typeof isActive === 'boolean' ? isActive : !tenant.isActive;
  await tenant.save();

  res.json({
    success: true,
    message: tenant.isActive ? 'Tenant activated' : 'Tenant deactivated',
    data: toTenantView(tenant),
  });
};

// @desc    Reset tenant password (returns new plain password once)
// @route   POST /api/tenants/:id/reset-password
const resetTenantPassword = async (req, res) => {
  const tenant = await User.findOne({ _id: req.params.id, role: 'tailor' });
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }

  const newPassword = generatePassword();
  tenant.password = newPassword;
  await tenant.save();

  res.json({
    success: true,
    message: 'Password reset',
    data: { ...toTenantView(tenant), generatedPassword: newPassword },
  });
};

// @desc    Delete a tailor tenant
// @route   DELETE /api/tenants/:id
const deleteTenant = async (req, res) => {
  const tenant = await User.findOneAndDelete({ _id: req.params.id, role: 'tailor' });
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }
  res.json({ success: true, message: 'Tailor tenant deleted' });
};

module.exports = {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  toggleTenantStatus,
  resetTenantPassword,
  deleteTenant,
};
