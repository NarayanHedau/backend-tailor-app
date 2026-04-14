const express = require('express');
const router = express.Router();
const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customerController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.route('/').get(getCustomers).post(createCustomer);
router.route('/:id').get(getCustomerById).put(updateCustomer).delete(deleteCustomer);

module.exports = router;
