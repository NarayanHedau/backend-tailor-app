require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const errorMiddleware = require('./middlewares/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const productRoutes = require('./routes/productRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const saleRoutes = require('./routes/saleRoutes');

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET) {
  const msg = 'JWT_SECRET is not set. Refusing to start without a secret.';
  if (isProduction) {
    logger.error(msg);
    process.exit(1);
  } else {
    logger.warn(`${msg} (development mode — using a random throw-away secret)`);
    process.env.JWT_SECRET = require('crypto').randomBytes(48).toString('hex');
  }
}

const app = express();

connectDB();

// ---------- Security headers ----------
app.use(helmet());

// ---------- CORS ----------
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  logger.error('FRONTEND_URL is not set in production. Refusing to start.');
  process.exit(1);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl / same-origin requests with no Origin header
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true); // dev fallback
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ---------- Body parsing (explicit size limit) ----------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------- Mongo operator stripping ----------
app.use(mongoSanitize());

// ---------- Logging ----------
app.use(morgan(isProduction ? 'combined' : 'dev'));

// ---------- Rate limiting ----------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, try again in 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);

// ---------- Static uploads (local fallback) ----------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- Routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', saleRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Tailor Tracking API is running' });
});

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Tailor Server is running' });
});

// ---------- 404 for unmatched /api routes ----------
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ---------- Global error handler ----------
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
