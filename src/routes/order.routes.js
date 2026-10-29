const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createOrderSchema, updateOrderStatusSchema } = require('../validators/order.validators');
const oc = require('../controllers/order.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/analytics/overview', authenticate(), authorize('admin'), asyncHandler(oc.stats));
router.get('/customer/:id/summary', authenticate(), asyncHandler(oc.customerSummary));
router.post('/', authenticate(), validate(createOrderSchema), asyncHandler(oc.create));
router.get('/', authenticate(), asyncHandler(oc.list));
router.get('/:id', authenticate(), asyncHandler(oc.getById));
router.patch('/:id/status', authenticate(), authorize('admin', 'seller'), validate(updateOrderStatusSchema), asyncHandler(oc.updateStatus));
router.delete('/:id', authenticate(), authorize('admin'), asyncHandler(oc.remove));

module.exports = router;
