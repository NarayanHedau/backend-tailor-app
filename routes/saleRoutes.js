const express = require('express');
const router = express.Router();
const { createSale, getSales, getSaleById, recordPayment, deleteSale, getSaleStats } = require('../controllers/saleController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/stats', getSaleStats);
router.route('/').get(getSales).post(createSale);
router.route('/:id').get(getSaleById).delete(deleteSale);
router.post('/:id/payment', recordPayment);

module.exports = router;
