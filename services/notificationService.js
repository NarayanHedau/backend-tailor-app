const logger = require('../utils/logger');

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

// Send tracking link via WhatsApp
const sendWhatsAppMessage = async (phone, message) => {
  const client = getTwilioClient();
  if (!client) {
    logger.warn('Twilio not configured — skipping WhatsApp notification');
    return false;
  }
  const to = `whatsapp:+${phone.replace(/\D/g, '')}`;
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to,
    body: message,
  });
  return true;
};

// Send tracking link via SMS
const sendSMS = async (phone, message) => {
  const client = getTwilioClient();
  if (!client) {
    logger.warn('Twilio not configured — skipping SMS notification');
    return false;
  }
  await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to: `+${phone.replace(/\D/g, '')}`,
    body: message,
  });
  return true;
};

const sendTrackingLink = async (phone, customerName, orderNumber, trackingUrl) => {
  const message =
    `Hello ${customerName}! 👋\n\n` +
    `Your tailor order *${orderNumber}* has been created.\n\n` +
    `Track your order here:\n${trackingUrl}\n\n` +
    `Thank you for your business! 🙏`;

  try {
    const whatsappSent = await sendWhatsAppMessage(phone, message);
    if (!whatsappSent) {
      await sendSMS(phone, message);
    }
    logger.info(`Tracking link sent to ${phone}`);
  } catch (error) {
    logger.error(`Notification error: ${error.message}`);
    throw error;
  }
};

module.exports = { sendTrackingLink, sendWhatsAppMessage, sendSMS };
