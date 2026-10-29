const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { updateUserSchema } = require('../validators/user.validators');
const uc = require('../controllers/user.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', authenticate(), authorize('admin'), asyncHandler(uc.list));
router.get('/:id', authenticate(), asyncHandler(uc.getById));
router.patch('/:id', authenticate(), validate(updateUserSchema), asyncHandler(uc.update));
router.delete('/:id', authenticate(), authorize('admin'), asyncHandler(uc.remove));

module.exports = router;
