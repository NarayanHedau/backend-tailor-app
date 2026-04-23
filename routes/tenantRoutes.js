const express = require('express');
const router = express.Router();
const {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  toggleTenantStatus,
  resetTenantPassword,
  deleteTenant,
} = require('../controllers/tenantController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect, authorize('superadmin'));

router.route('/').get(getTenants).post(createTenant);
router.route('/:id').get(getTenantById).put(updateTenant).delete(deleteTenant);
router.patch('/:id/status', toggleTenantStatus);
router.post('/:id/reset-password', resetTenantPassword);

module.exports = router;
