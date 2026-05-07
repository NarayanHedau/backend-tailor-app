const express = require('express');
const router = express.Router();
const {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  toggleTenantStatus,
  resetTenantPassword,
  getTenantMessagingUsage,
  resetTenantWhatsAppUsage,
  deleteTenant,
} = require('../controllers/tenantController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect, authorize('superadmin'));

router.route('/').get(getTenants).post(createTenant);
router.route('/:id').get(getTenantById).put(updateTenant).delete(deleteTenant);
router.patch('/:id/status', toggleTenantStatus);
router.post('/:id/reset-password', resetTenantPassword);
router.get('/:id/messaging-usage', getTenantMessagingUsage);
router.post('/:id/reset-whatsapp-usage', resetTenantWhatsAppUsage);

module.exports = router;
