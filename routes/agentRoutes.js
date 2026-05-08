const express = require('express');
const router = express.Router();
const {
  createAgent,
  getAgents,
  getAgentById,
  updateAgent,
  toggleAgentStatus,
  resetAgentPassword,
  deleteAgent,
} = require('../controllers/agentController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.use(protect, authorize('superadmin'));

router.route('/').get(getAgents).post(createAgent);
router.route('/:id').get(getAgentById).put(updateAgent).delete(deleteAgent);
router.patch('/:id/status', toggleAgentStatus);
router.post('/:id/reset-password', resetAgentPassword);

module.exports = router;
