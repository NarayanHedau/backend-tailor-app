const logger = require('../utils/logger');

let cachedTransporter = null;

const isConfigured = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return false;
  if (host.startsWith('your_') || user.startsWith('your_') || pass.startsWith('your_')) return false;
  return true;
};

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;
  if (!isConfigured()) return null;

  const nodemailer = require('nodemailer');
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  return cachedTransporter;
};

const fromAddress = () =>
  process.env.SMTP_FROM ||
  `${process.env.SHOP_NAME || 'Tailor Tracker'} <${process.env.SMTP_USER}>`;

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn(`SMTP not configured — skipping email to ${to} ("${subject}")`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  const info = await transporter.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });
  logger.info(`Email sent to ${to} (messageId=${info.messageId})`);
  return { sent: true, messageId: info.messageId };
};

// ─── Domain emails ────────────────────────────────────────────────────────────

const sendAgentCredentials = async ({ to, name, email, password, loginUrl }) => {
  const platformName = process.env.SHOP_NAME || 'Tailor Tracker';
  const safeName = escapeHtml(name || 'Agent');
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const url = loginUrl || `${(process.env.FRONTEND_URL || '').replace(/\/+$/, '')}/admin/login`;

  const text =
    `Hello ${name || 'there'},\n\n` +
    `Your ${platformName} agent account has been created.\n\n` +
    `Login URL: ${url}\n` +
    `Email:     ${email}\n` +
    `Password:  ${password}\n\n` +
    `For security, please change your password after first login.\n\n` +
    `— ${platformName}`;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827;margin:0 0 16px">Welcome to ${escapeHtml(platformName)}</h2>
      <p>Hello ${safeName},</p>
      <p>Your <strong>agent account</strong> has been created. You can now sign in and start onboarding tailor tenants.</p>
      <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr><td style="padding:6px 12px;color:#6b7280">Email</td>
            <td style="padding:6px 12px;font-family:monospace">${safeEmail}</td></tr>
        <tr><td style="padding:6px 12px;color:#6b7280">Password</td>
            <td style="padding:6px 12px;font-family:monospace">${safePassword}</td></tr>
      </table>
      <p>
        <a href="${escapeHtml(url)}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
          Sign in
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin-top:24px">
        For security, please change your password after the first login.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="color:#9ca3af;font-size:12px">— ${escapeHtml(platformName)}</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Your ${platformName} agent account credentials`,
    text,
    html,
  });
};

const sendPasswordResetEmail = async ({ to, name, resetUrl, expiresInMinutes = 60 }) => {
  const platformName = process.env.SHOP_NAME || 'Tailor Tracker';
  const safeName = escapeHtml(name || 'there');
  const safeUrl = escapeHtml(resetUrl);

  const text =
    `Hello ${name || 'there'},\n\n` +
    `We received a request to reset your ${platformName} password.\n\n` +
    `Click the link below to set a new password (valid for ${expiresInMinutes} minutes):\n` +
    `${resetUrl}\n\n` +
    `If you did not request this, you can safely ignore this email — your password will stay the same.\n\n` +
    `— ${platformName}`;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#111827;margin:0 0 16px">Reset your password</h2>
      <p>Hello ${safeName},</p>
      <p>We received a request to reset your <strong>${escapeHtml(platformName)}</strong> account password.</p>
      <p>
        <a href="${safeUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">
          Reset password
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">
        Or copy this link: <br/>
        <span style="font-family:monospace;font-size:12px;word-break:break-all">${safeUrl}</span>
      </p>
      <p style="color:#6b7280;font-size:13px">
        This link will expire in <strong>${expiresInMinutes} minutes</strong>. If you did not request this,
        you can safely ignore this email — your password will stay the same.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="color:#9ca3af;font-size:12px">— ${escapeHtml(platformName)}</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Reset your ${platformName} password`,
    text,
    html,
  });
};

module.exports = {
  sendEmail,
  sendAgentCredentials,
  sendPasswordResetEmail,
  isEmailConfigured: isConfigured,
};
