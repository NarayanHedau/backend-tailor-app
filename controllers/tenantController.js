const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const MessageLog = require('../models/MessageLog');
const { sendEmail } = require('../services/emailService');
const logger = require('../utils/logger');

// Generate a readable 12-char password: 8 random base64 chars + "A1!" suffix
const generatePassword = () => {
  const random = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 8);
  return `${random}A1!`;
};

// Build view with optional populated creator info.
const toTenantView = (user) => {
  const creator = user.createdBy && typeof user.createdBy === 'object' ? user.createdBy : null;
  return {
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
    createdBy: creator
      ? {
          _id: creator._id,
          name: creator.name,
          email: creator.email,
          role: creator.role,
        }
      : user.createdBy || null,
  };
};

// Build a Mongo query that scopes tenant access to the current user.
// - superadmin can see/edit any tenant
// - agent can only see/edit tenants they themselves created
const tenantScopeQuery = (req, extra = {}) => {
  const base = { role: 'tailor', ...extra };
  if (req.user?.role === 'agent') {
    base.createdBy = req.user._id;
  }
  return base;
};

// @desc    Create a tailor tenant (superadmin or agent)
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

  // Best-effort email of credentials to the tailor — failure does not block creation.
  let emailResult = { sent: false, reason: 'smtp_not_configured' };
  try {
    const platformName = process.env.SHOP_NAME || 'Tailor Tracker';
    const loginUrl = `${(process.env.FRONTEND_URL || '').replace(/\/+$/, '')}/admin/login`;
    emailResult = await sendEmail({
      to: tenant.email,
      subject: `Your ${platformName} tenant account is ready`,
      text:
        `Hello ${tenant.name},\n\n` +
        `Your ${platformName} tailor tenant account has been created.\n\n` +
        `Login URL: ${loginUrl}\n` +
        `Email:     ${tenant.email}\n` +
        `Password:  ${plainPassword}\n\n` +
        `Please change your password after first login.\n\n` +
        `— ${platformName}`,
    });
  } catch (err) {
    logger.warn(`Failed to email tenant credentials: ${err.message}`);
    emailResult = { sent: false, reason: err.message };
  }

  // Populate createdBy for the response so the client can show "created by"
  await tenant.populate('createdBy', 'name email role');

  res.status(201).json({
    success: true,
    message: emailResult.sent
      ? 'Tailor tenant created — credentials emailed'
      : 'Tailor tenant created (credentials shown below; email delivery skipped/failed)',
    data: { ...toTenantView(tenant), generatedPassword: plainPassword, emailDelivery: emailResult },
  });
};

// @desc    List tailor tenants — superadmin sees all, agent sees own
// @route   GET /api/tenants
const getTenants = async (req, res) => {
  const { search, createdBy } = req.query;
  const query = tenantScopeQuery(req);

  // Apply search filter if provided
  if (search && search.trim()) {
    const rx = { $regex: String(search).trim(), $options: 'i' };
    query.$or = [{ name: rx }, { email: rx }, { shopName: rx }, { phone: rx }];
  }

  // Apply createdBy filter if provided and valid
  if (createdBy && String(createdBy).trim()) {
    try {
      query.createdBy = mongoose.Types.ObjectId(createdBy);
    } catch (err) {
      // If invalid ObjectId format, just use the string value as fallback
      query.createdBy = createdBy;
    }
  }

  const tenants = await User.find(query)
    .populate('createdBy', 'name email role')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: tenants.map(toTenantView) });
};

// @desc    Get a single tailor tenant
// @route   GET /api/tenants/:id
const getTenantById = async (req, res) => {
  const tenant = await User.findOne(tenantScopeQuery(req, { _id: req.params.id })).populate(
    'createdBy',
    'name email role'
  );
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }
  res.json({ success: true, data: toTenantView(tenant) });
};

// @desc    Update a tailor tenant
// @route   PUT /api/tenants/:id
const updateTenant = async (req, res) => {
  const tenant = await User.findOne(tenantScopeQuery(req, { _id: req.params.id }));
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
  if (typeof isActive === 'boolean' && req.user?.role === 'superadmin') {
    tenant.isActive = isActive;
  }

  // Only superadmin may change the WhatsApp quota — agents must not raise their own quota
  if (req.user?.role === 'superadmin') {
    const { whatsappQuota } = req.body || {};
    if (whatsappQuota !== undefined && Number.isFinite(Number(whatsappQuota))) {
      tenant.whatsappQuota = Number(whatsappQuota);
    }
  }

  let passwordChanged = false;
  if (password && String(password).length >= 6) {
    tenant.password = String(password);
    passwordChanged = true;
  }

  await tenant.save();
  await tenant.populate('createdBy', 'name email role');
  res.json({
    success: true,
    message: passwordChanged ? 'Tailor tenant updated (password changed)' : 'Tailor tenant updated',
    data: toTenantView(tenant),
  });
};

// @desc    Toggle active status
// @route   PATCH /api/tenants/:id/status
const toggleTenantStatus = async (req, res) => {
  const tenant = await User.findOne(tenantScopeQuery(req, { _id: req.params.id }));
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }

  const { isActive } = req.body || {};
  tenant.isActive = typeof isActive === 'boolean' ? isActive : !tenant.isActive;
  await tenant.save();
  await tenant.populate('createdBy', 'name email role');

  res.json({
    success: true,
    message: tenant.isActive ? 'Tenant activated' : 'Tenant deactivated',
    data: toTenantView(tenant),
  });
};

// @desc    Reset tenant password (returns new plain password once + emails it)
// @route   POST /api/tenants/:id/reset-password
const resetTenantPassword = async (req, res) => {
  const tenant = await User.findOne(tenantScopeQuery(req, { _id: req.params.id }));
  if (!tenant) {
    return res.status(404).json({ success: false, message: 'Tailor tenant not found' });
  }

  const newPassword = generatePassword();
  tenant.password = newPassword;
  await tenant.save();

  let emailResult = { sent: false, reason: 'smtp_not_configured' };
  try {
    const platformName = process.env.SHOP_NAME || 'Tailor Tracker';
    const loginUrl = `${(process.env.FRONTEND_URL || '').replace(/\/+$/, '')}/admin/login`;
    emailResult = await sendEmail({
      to: tenant.email,
      subject: `${platformName}: Your password has been reset`,
      text:
        `Hello ${tenant.name},\n\n` +
        `Your password was reset.\n\n` +
        `Login URL: ${loginUrl}\n` +
        `Email:     ${tenant.email}\n` +
        `Password:  ${newPassword}\n\n` +
        `Please change your password after login.\n\n` +
        `— ${platformName}`,
    });
  } catch (err) {
    logger.warn(`Failed to email tenant password reset: ${err.message}`);
    emailResult = { sent: false, reason: err.message };
  }

  await tenant.populate('createdBy', 'name email role');

  res.json({
    success: true,
    message: 'Password reset',
    data: { ...toTenantView(tenant), generatedPassword: newPassword, emailDelivery: emailResult },
  });
};

// @desc    Get WhatsApp/SMS usage for a tenant
// @route   GET /api/tenants/:id/messaging-usage
const getTenantMessagingUsage = async (req, res) => {
  const tenant = await User.findOne(tenantScopeQuery(req, { _id: req.params.id }));
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

// @desc    Reset a tenant's monthly counter (manual override) — superadmin only
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

// @desc    Delete a tailor tenant — SUPERADMIN ONLY
// @route   DELETE /api/tenants/:id
const deleteTenant = async (req, res) => {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Only superadmin can delete tenants',
    });
  }
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
