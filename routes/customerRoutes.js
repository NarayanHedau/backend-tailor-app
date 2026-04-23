const express = require('express');
const router = express.Router();
const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  addMeasurementProfile,
  updateMeasurementProfile,
  deleteMeasurementProfile,
} = require('../controllers/customerController');
const { protect, tenantScope } = require('../middlewares/authMiddleware');

router.use(protect, tenantScope);

router.route('/').get(getCustomers).post(createCustomer);
router.route('/:id').get(getCustomerById).put(updateCustomer).delete(deleteCustomer);

// Measurement profiles
router.post('/:id/measurements', addMeasurementProfile);
router.put('/:id/measurements/:profileId', updateMeasurementProfile);
router.delete('/:id/measurements/:profileId', deleteMeasurementProfile);

module.exports = router;
