const express = require('express');
const router = express.Router();
const { createPurchase, getPurchases, getPurchaseById, recordPayment, deletePurchase, getPurchaseStats, getBusinessChartData } = require('../controllers/purchaseController');
const { protect, tenantScope } = require('../middlewares/authMiddleware');

router.use(protect, tenantScope);
router.get('/stats', getPurchaseStats);
router.get('/business-chart', getBusinessChartData);
router.route('/').get(getPurchases).post(createPurchase);
router.route('/:id').get(getPurchaseById).delete(deletePurchase);
router.post('/:id/payment', recordPayment);

module.exports = router;
