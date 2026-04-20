const express = require('express');
const router = express.Router();
const { createSupplier, getSuppliers, getSupplierById, updateSupplier, deleteSupplier } = require('../controllers/supplierController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);
router.route('/').get(getSuppliers).post(createSupplier);
router.route('/:id').get(getSupplierById).put(updateSupplier).delete(deleteSupplier);

module.exports = router;
