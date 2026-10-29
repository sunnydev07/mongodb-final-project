const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  productCreateSchema,
  productUpdateSchema,
  productQuerySchema,
} = require('../validators/product.validators');
const { reviewCreateSchema } = require('../validators/review.validators');
const pc = require('../controllers/product.controller');
const rc = require('../controllers/review.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', validate(productQuerySchema, 'query'), asyncHandler(pc.list));
router.get('/analytics/overview', asyncHandler(pc.aggregations));
router.get('/:productId/reviews', asyncHandler(rc.listByProduct));
router.post(
  '/:productId/reviews',
  authenticate(),
  validate(reviewCreateSchema),
  asyncHandler(rc.create)
);
router.get('/:id', asyncHandler(pc.getById));
router.post('/', authenticate(), authorize('seller', 'admin'), validate(productCreateSchema), asyncHandler(pc.create));
router.patch('/:id', authenticate(), authorize('seller', 'admin'), validate(productUpdateSchema), asyncHandler(pc.update));
router.delete('/:id', authenticate(), authorize('admin'), asyncHandler(pc.remove));

module.exports = router;
