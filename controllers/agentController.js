const crypto = require('crypto');
const User = require('../models/User');
const { sendAgentCredentials } = require('../services/emailService');
const logger = require('../utils/logger');

// Generate a readable 12-char password: 8 random base64 chars + "A1!" suffix
const generatePassword = () => {
  const random = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 8);
  return `${random}A1!`;
};

const toAgentView = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// @desc    Create a new agent (superadmin only). Emails credentials.
// @route   POST /api/agents
const createAgent = async (req, res) => {
  const { name, email, phone, password } = req.body || {};

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

  const agent = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: plainPassword,
    phone: phone ? String(phone).trim() : undefined,
    role: 'agent',
    isActive: true,
    createdBy: req.user?._id,
  });

  // Try to email credentials. Failure does not block agent creation.
  let emailResult = { sent: false, reason: 'smtp_not_configured' };
  try {
    emailResult = await sendAgentCredentials({
      to: agent.email,
      name: agent.name,
      email: agent.email,
      password: plainPassword,
    });
  } catch (err) {
    logger.warn(`Failed to email agent credentials: ${err.message}`);
    emailResult = { sent: false, reason: err.message };
  }

  res.status(201).json({
    success: true,
    message: emailResult.sent
      ? 'Agent created — credentials emailed'
      : 'Agent created (credentials shown below; email delivery skipped/failed)',
    data: {
      ...toAgentView(agent),
      generatedPassword: plainPassword,
      emailDelivery: emailResult,
    },
  });
};

// Build a map { agentId: tenantCount } in one query
const tenantCountsForAgents = async (agentIds) => {
  if (!agentIds.length) return {};
  const groups = await User.aggregate([
    { $match: { role: 'tailor', createdBy: { $in: agentIds } } },
    { $group: { _id: '$createdBy', count: { $sum: 1 } } },
  ]);
  return groups.reduce((acc, g) => {
    acc[String(g._id)] = g.count;
    return acc;
  }, {});
};

// @desc    List all agents — includes tenantCount per agent
// @route   GET /api/agents
const getAgents = async (req, res) => {
  const { search } = req.query;
  const query = { role: 'agent' };

  if (search) {
    const rx = { $regex: String(search).trim(), $options: 'i' };
    query.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const agents = await User.find(query).sort({ createdAt: -1 });
  const counts = await tenantCountsForAgents(agents.map((a) => a._id));

  const data = agents.map((a) => ({
    ...toAgentView(a),
    tenantCount: counts[String(a._id)] || 0,
  }));

  res.json({ success: true, data });
};

// @desc    Get a single agent (includes tenantCount)
// @route   GET /api/agents/:id
const getAgentById = async (req, res) => {
  const agent = await User.findOne({ _id: req.params.id, role: 'agent' });
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }
  const tenantCount = await User.countDocuments({ role: 'tailor', createdBy: agent._id });
  res.json({ success: true, data: { ...toAgentView(agent), tenantCount } });
};

// @desc    Update an agent
// @route   PUT /api/agents/:id
const updateAgent = async (req, res) => {
  const agent = await User.findOne({ _id: req.params.id, role: 'agent' });
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }

  const { name, email, phone, password, isActive } = req.body || {};

  if (email && email.toLowerCase().trim() !== agent.email) {
    const normalizedEmail = email.toLowerCase().trim();
    const clash = await User.findOne({ email: normalizedEmail, _id: { $ne: agent._id } });
    if (clash) {
      return res.status(409).json({
        success: false,
        message: `Email ${normalizedEmail} is already in use`,
      });
    }
    agent.email = normalizedEmail;
  }

  if (name !== undefined) agent.name = String(name).trim();
  if (phone !== undefined) agent.phone = String(phone).trim();
  if (typeof isActive === 'boolean') agent.isActive = isActive;

  let passwordChanged = false;
  if (password && String(password).length >= 6) {
    agent.password = String(password);
    passwordChanged = true;
  }

  await agent.save();
  res.json({
    success: true,
    message: passwordChanged ? 'Agent updated (password changed)' : 'Agent updated',
    data: toAgentView(agent),
  });
};

// @desc    Toggle active status
// @route   PATCH /api/agents/:id/status
const toggleAgentStatus = async (req, res) => {
  const agent = await User.findOne({ _id: req.params.id, role: 'agent' });
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }

  const { isActive } = req.body || {};
  agent.isActive = typeof isActive === 'boolean' ? isActive : !agent.isActive;
  await agent.save();

  res.json({
    success: true,
    message: agent.isActive ? 'Agent activated' : 'Agent deactivated',
    data: toAgentView(agent),
  });
};

// @desc    Reset agent password — generates a new one and emails it
// @route   POST /api/agents/:id/reset-password
const resetAgentPassword = async (req, res) => {
  const agent = await User.findOne({ _id: req.params.id, role: 'agent' });
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }

  const newPassword = generatePassword();
  agent.password = newPassword;
  await agent.save();

  let emailResult = { sent: false, reason: 'smtp_not_configured' };
  try {
    emailResult = await sendAgentCredentials({
      to: agent.email,
      name: agent.name,
      email: agent.email,
      password: newPassword,
    });
  } catch (err) {
    logger.warn(`Failed to email agent credentials on reset: ${err.message}`);
    emailResult = { sent: false, reason: err.message };
  }

  res.json({
    success: true,
    message: emailResult.sent
      ? 'Password reset — new credentials emailed'
      : 'Password reset (credentials shown below; email delivery skipped/failed)',
    data: {
      ...toAgentView(agent),
      generatedPassword: newPassword,
      emailDelivery: emailResult,
    },
  });
};

// @desc    Delete an agent
// @route   DELETE /api/agents/:id
const deleteAgent = async (req, res) => {
  const agent = await User.findOneAndDelete({ _id: req.params.id, role: 'agent' });
  if (!agent) {
    return res.status(404).json({ success: false, message: 'Agent not found' });
  }
  res.json({ success: true, message: 'Agent deleted' });
};

module.exports = {
  createAgent,
  getAgents,
  getAgentById,
  updateAgent,
  toggleAgentStatus,
  resetAgentPassword,
  deleteAgent,
};
