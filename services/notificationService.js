const logger = require('../utils/logger');
const User = require('../models/User');
const MessageLog = require('../models/MessageLog');

// ─── Twilio client (single shared platform sender) ────────────────────────────
let twilioClient = null;

const getTwilioClient = () => {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken || accountSid.startsWith('your_')) {
      return null;
    }
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
};

// Normalize phone to digits with default country code prefix.
const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const defaultCC = (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
  if (digits.length === 10 && defaultCC) return `${defaultCC}${digits}`;
  return digits;
};

// Format the shop phone for display in the message body (with leading '+').
const formatDisplayPhone = (phone) => {
  if (!phone) return '';
  const norm = normalizePhone(phone);
  return norm ? `+${norm}` : '';
};

// ─── Quota management ─────────────────────────────────────────────────────────
const ensureMonthlyReset = async (tenant) => {
  if (!tenant.whatsappQuotaResetAt || new Date() >= tenant.whatsappQuotaResetAt) {
    const now = new Date();
    tenant.whatsappUsed = 0;
    tenant.whatsappQuotaResetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await tenant.save();
  }
};

const hasQuota = (tenant) => {
  const limit = tenant.whatsappQuota ?? 0;
  const used = tenant.whatsappUsed ?? 0;
  return limit < 0 || used < limit; // -1 = unlimited
};

// ─── Low-level senders ────────────────────────────────────────────────────────
const sendWhatsAppMessage = async (phone, message) => {
  const client = getTwilioClient();
  if (!client) {
    logger.warn('Twilio not configured — skipping WhatsApp notification');
    return null;
  }
  const to = `whatsapp:+${normalizePhone(phone)}`;
  const result = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to,
    body: message,
  });
  return result;
};

const sendSMS = async (phone, message) => {
  const client = getTwilioClient();
  if (!client) {
    logger.warn('Twilio not configured — skipping SMS notification');
    return null;
  }
  const result = await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to: `+${normalizePhone(phone)}`,
    body: message,
  });
  return result;
};

// ─── Message body (shared platform number → shop branded body) ───────────────
const buildOrderMessage = ({
  customerName,
  invoiceNumber,
  trackingId,
  baseUrl,
  shopName,
  shopPhone,
}) => {
  const root = (baseUrl || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  const viewUrl = `${root}/stitch-invoice/view/public/${trackingId}/`;
  const trackUrl = `${root}/stitch-invoice/track/public/${trackingId}/`;
  const ref = invoiceNumber || '';
  const shop = shopName || process.env.SHOP_NAME || 'Tailor Shop';
  const shopContact = formatDisplayPhone(shopPhone);

  let msg =
    `Hello ${customerName},\n` +
    `Download your Stitching Invoice ${ref}:\n` +
    `${viewUrl}\n\n` +
    `Track your Stitching Invoice ${ref}:\n` +
    `${trackUrl}\n\n`;

  if (shopContact) {
    msg += `Need help? Call ${shop} at ${shopContact}\n\n`;
  }

  msg += `Thank You!\n\n${shop}`;
  return msg;
};

// ─── High-level: order confirmation with quota + logging ─────────────────────
const sendOrderConfirmation = async ({
  tenantId,
  phone,
  customerName,
  invoiceNumber,
  trackingId,
  customerId,
  orderId,
}) => {
  if (!tenantId || !phone || !trackingId) {
    logger.warn('sendOrderConfirmation: missing tenantId / phone / trackingId — skipping');
    return { sent: false, reason: 'missing_params' };
  }

  // Load tenant for shop branding + quota
  const tenant = await User.findById(tenantId);
  if (!tenant) {
    logger.warn(`sendOrderConfirmation: tenant ${tenantId} not found — skipping`);
    return { sent: false, reason: 'tenant_not_found' };
  }

  await ensureMonthlyReset(tenant);

  if (!hasQuota(tenant)) {
    logger.warn(
      `Tenant ${tenant._id} (${tenant.shopName || tenant.email}) has hit WhatsApp quota ` +
      `${tenant.whatsappUsed}/${tenant.whatsappQuota} — skipping`
    );
    await MessageLog.create({
      tenantId: tenant._id,
      customer_id: customerId,
      order_id: orderId,
      channel: 'whatsapp',
      to: phone,
      status: 'skipped',
      errorMessage: 'quota_exceeded',
    });
    return { sent: false, reason: 'quota_exceeded' };
  }

  const message = buildOrderMessage({
    customerName,
    invoiceNumber,
    trackingId,
    shopName: tenant.shopName,
    shopPhone: tenant.phone,
  });

  let channel = 'whatsapp';
  let providerMessage = null;

  try {
    providerMessage = await sendWhatsAppMessage(phone, message);
    if (!providerMessage) {
      // Twilio not configured — try SMS fallback (also no-ops if not configured)
      channel = 'sms';
      providerMessage = await sendSMS(phone, message);
    }

    if (!providerMessage) {
      // No provider configured at all
      await MessageLog.create({
        tenantId: tenant._id,
        customer_id: customerId,
        order_id: orderId,
        channel: 'whatsapp',
        to: phone,
        status: 'skipped',
        errorMessage: 'provider_not_configured',
      });
      return { sent: false, reason: 'provider_not_configured' };
    }

    // Increment tenant usage atomically
    await User.findByIdAndUpdate(tenant._id, { $inc: { whatsappUsed: 1 } });

    await MessageLog.create({
      tenantId: tenant._id,
      customer_id: customerId,
      order_id: orderId,
      channel,
      to: phone,
      status: 'sent',
      providerMessageId: providerMessage.sid,
    });

    logger.info(
      `Order confirmation sent via ${channel} for tenant ${tenant._id} ` +
      `(${tenant.whatsappUsed + 1}/${tenant.whatsappQuota}) → ${phone}`
    );
    return { sent: true, channel, providerMessageId: providerMessage.sid };
  } catch (error) {
    logger.error(`Notification error: ${error.message}`);
    await MessageLog.create({
      tenantId: tenant._id,
      customer_id: customerId,
      order_id: orderId,
      channel,
      to: phone,
      status: 'failed',
      errorMessage: error.message,
    });
    throw error;
  }
};

module.exports = {
  sendOrderConfirmation,
  sendWhatsAppMessage,
  sendSMS,
  buildOrderMessage,
};
