require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const errorMiddleware = require('./middlewares/errorMiddleware');

// Route imports
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const productRoutes = require('./routes/productRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const saleRoutes = require('./routes/saleRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const agentRoutes = require('./routes/agentRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static uploads folder (local fallback)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/products', productRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/agents', agentRoutes);

// Redirect reset password requests to the frontend if someone follows a backend-hosted reset link.
app.get('/admin/reset-password', (req, res) => {
  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$|\/+$/, '');
  const token = req.query.token ? `?token=${encodeURIComponent(req.query.token)}` : '';

  if (!frontendUrl) {
    return res.status(500).json({
      success: false,
      message:
        'Frontend URL is not configured. Set FRONTEND_URL to your frontend host so reset links can redirect correctly.',
    });
  }

  return res.redirect(`${frontendUrl}/admin/reset-password${token}`);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Tailor Tracking API is running' });
});

// 404 handler
// app.use((req, res) => {
//   res.status(404).json({ success: false, message: 'Route not found' });
// });
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Tailor Server is running' });
});


// Global error handler
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
