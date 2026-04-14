const express = require('express');
const router = express.Router();
const { getTrackingInfo } = require('../controllers/trackingController');

// Public route - no auth
router.get('/:trackingId', getTrackingInfo);

module.exports = router;
