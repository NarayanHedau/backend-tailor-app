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

// Both superadmin and agent can manage tenants. Per-action restrictions
// (delete, quota change, etc.) are enforced inside the controllers.
router.use(protect, authorize('superadmin', 'agent'));

router.route('/').get(getTenants).post(createTenant);
router.route('/:id').get(getTenantById).put(updateTenant).delete(deleteTenant);
router.patch('/:id/status', authorize('superadmin'), toggleTenantStatus);
router.post('/:id/reset-password', resetTenantPassword);
router.get('/:id/messaging-usage', getTenantMessagingUsage);

// Resetting the messaging usage counter is a privileged action
router.post('/:id/reset-whatsapp-usage', authorize('superadmin'), resetTenantWhatsAppUsage);

module.exports = router;
