const express = require('express');
const router = express.Router();
const {
  login,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

// Public — forgot/reset password (any role)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
