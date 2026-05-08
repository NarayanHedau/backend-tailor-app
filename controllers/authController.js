const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { loginSchema } = require('../utils/validators');
const { sendPasswordResetEmail } = require('../services/emailService');
const logger = require('../utils/logger');

const RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60);

const hashToken = (rawToken) =>
  crypto.createHash('sha256').update(String(rawToken)).digest('hex');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// @desc    Admin login
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });

  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (user.isActive === false) {
    return res.status(403).json({
      success: false,
      message: 'Your account has been deactivated. Please contact support.',
    });
  }

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    },
  });
};

// @desc    Get current logged-in admin
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json({ success: true, data: user });
};

// @desc    Change admin password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  if (!(await user.matchPassword(currentPassword))) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated successfully' });
};

// @desc    Request a password reset link by email (public)
// @route   POST /api/auth/forgot-password
// @access  Public
//
// Always returns 200 with a generic message (no enumeration of which emails exist).
const forgotPassword = async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const genericResponse = {
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
  };

  const user = await User.findOne({ email });

  // Don't leak whether the email is registered. Just behave the same.
  if (!user || user.isActive === false) {
    return res.json(genericResponse);
  }

  // Generate a strong random token; store only its hash so a DB leak does not
  // expose live reset tokens. The plaintext is sent in the email link only.
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetTokenHash = hashToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await user.save();

  const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  const frontendUrl = (process.env.FRONTEND_URL || origin || '').replace(/\/+$/, '');
  const resetUrl = `${frontendUrl}/admin/reset-password?token=${rawToken}`;

  let emailResult = { sent: false, reason: 'smtp_not_configured' };
  try {
    emailResult = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    });
  } catch (err) {
    logger.warn(`Failed to send password reset email: ${err.message}`);
  }

  // In development / when SMTP is not configured, surface the reset URL so the
  // admin can still test the flow without email delivery.
  const includeDebug =
    process.env.NODE_ENV !== 'production' || !emailResult.sent;

  res.json({
    ...genericResponse,
    ...(includeDebug ? { debug: { resetUrl, emailDelivery: emailResult } } : {}),
  });
};

// @desc    Reset password using the emailed token (public)
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ success: false, message: 'token and newPassword are required' });
  }
  if (String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const tokenHash = hashToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires');

  if (!user) {
    return res
      .status(400)
      .json({ success: false, message: 'Reset link is invalid or has expired' });
  }

  user.password = String(newPassword);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successful. You can now sign in with your new password.',
  });
};

module.exports = { login, getMe, changePassword, forgotPassword, resetPassword };
