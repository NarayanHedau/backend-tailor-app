const express = require('express');
const router = express.Router();
const {
  createInvoice,
  getInvoiceByOrder,
  recordPayment,
  getAllInvoices,
} = require('../controllers/invoiceController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.route('/').get(getAllInvoices).post(createInvoice);
router.get('/order/:orderId', getInvoiceByOrder);
router.post('/:id/payment', recordPayment);

module.exports = router;
