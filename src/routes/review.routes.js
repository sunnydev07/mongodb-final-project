const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { reviewUpdateSchema } = require('../validators/review.validators');
const rc = require('../controllers/review.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.patch('/:id', authenticate(), validate(reviewUpdateSchema), asyncHandler(rc.update));
router.delete('/:id', authenticate(), asyncHandler(rc.remove));

module.exports = router;
