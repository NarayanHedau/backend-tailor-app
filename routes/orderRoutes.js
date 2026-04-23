const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  updateItemStatus,
  uploadItemImage,
  updateMeasurements,
  getDashboardStats,
  getDeadlines,
  getChartData,
  deleteOrder,
} = require('../controllers/orderController');
const { protect, tenantScope } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/uploadMiddleware');

router.use(protect, tenantScope);

router.get('/stats', getDashboardStats);
router.get('/deadlines', getDeadlines);
router.get('/chart-data', getChartData);
router.route('/').get(getOrders).post(createOrder);
router.route('/:id').get(getOrderById).put(updateOrder).delete(deleteOrder);
router.put('/:orderId/items/:itemId/status', updateItemStatus);
router.put('/:orderId/items/:itemId/measurements', updateMeasurements);
router.post('/:orderId/items/:itemId/image', upload.single('image'), uploadItemImage);

module.exports = router;
