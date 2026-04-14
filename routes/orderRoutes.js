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
  deleteOrder,
} = require('../controllers/orderController');
const { protect } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/uploadMiddleware');

router.use(protect);

router.get('/stats', getDashboardStats);
router.route('/').get(getOrders).post(createOrder);
router.route('/:id').get(getOrderById).put(updateOrder).delete(deleteOrder);
router.put('/:orderId/items/:itemId/status', updateItemStatus);
router.put('/:orderId/items/:itemId/measurements', updateMeasurements);
router.post('/:orderId/items/:itemId/image', upload.single('image'), uploadItemImage);

module.exports = router;
