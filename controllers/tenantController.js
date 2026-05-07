const crypto = require('crypto');
const User = require('../models/User');
const MessageLog = require('../models/MessageLog');

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
  whatsappQuota: user.whatsappQuota ?? 0,
  whatsappUsed: user.whatsappUsed ?? 0,
  whatsappQuotaResetAt: user.whatsappQuotaResetAt,
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

  const { whatsappQuota } = req.body || {};
  const tenant = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: plainPassword,
    shopName: shopName ? String(shopName).trim() : undefined,
    phone: phone ? String(phone).trim() : undefined,
    role: 'tailor',
    isActive: true,
    createdBy: req.user?._id,
    ...(Number.isFinite(Number(whatsappQuota)) ? { whatsappQuota: Number(whatsappQuota) } : {}),
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

  const { whatsappQuota } = req.body || {};
  if (whatsappQuota !== undefined && Number.isFinite(Number(whatsappQuota))) {
    tenant.whatsappQuota = Number(whatsappQuota);
  }

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

// @desc    Get WhatsApp/SMS usage for a tenant
// @route   GET /api/tenants/:id/messaging-usage
const getTenantMessagingUsage = async (req, res) => {
  const tenant = await User.findOne({ _id: req.params.id, role: 'tailor' });
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }

  const { from, to, limit = 50 } = req.query;
  const match = { tenantId: tenant._id };
  if (from || to) {
    match.sentAt = {};
    if (from) match.sentAt.$gte = new Date(from);
    if (to) match.sentAt.$lte = new Date(to);
  }

  const [counts, recent] = await Promise.all([
    MessageLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: { channel: '$channel', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    MessageLog.find(match).sort({ sentAt: -1 }).limit(Number(limit)).lean(),
  ]);

  // Flatten counts into a 2-level object: { whatsapp: { sent: 12, failed: 1 }, sms: {...} }
  const summary = {};
  counts.forEach(({ _id, count }) => {
    summary[_id.channel] = summary[_id.channel] || {};
    summary[_id.channel][_id.status] = count;
  });

  res.json({
    success: true,
    data: {
      tenant: toTenantView(tenant),
      summary,
      recent,
    },
  });
};

// @desc    Reset a tenant's monthly counter (manual override)
// @route   POST /api/tenants/:id/reset-whatsapp-usage
const resetTenantWhatsAppUsage = async (req, res) => {
  const tenant = await User.findOne({ _id: req.params.id, role: 'tailor' });
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }

  const now = new Date();
  tenant.whatsappUsed = 0;
  tenant.whatsappQuotaResetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  await tenant.save();

  res.json({
    success: true,
    message: 'WhatsApp usage counter reset',
    data: toTenantView(tenant),
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
  getTenantMessagingUsage,
  resetTenantWhatsAppUsage,
  deleteTenant,
};
