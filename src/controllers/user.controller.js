const User = require('../models/User');
const { ok, noContent } = require('../utils/response');
const { parsePagination, buildMeta } = require('../utils/pagination');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.list = wrap(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-password'),
    User.countDocuments(filter),
  ]);
  return ok(res, users, 200, buildMeta(total, page, limit));
});

exports.getById = wrap(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ok(res, user);
});

exports.update = wrap(async (req, res) => {
  const callerId = String(req.user._id || req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && callerId !== String(req.params.id)) {
    return res.status(403).json({ success: false, message: 'You can only update your own profile' });
  }

  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const payload = { ...req.body };
  if (!isAdmin) {
    delete payload.role;
    delete payload.isActive;
  }

  Object.assign(user, payload);
  await user.save(); // Triggers the bcrypt pre-save hook when password changes.
  return ok(res, user.toSafeObject());
});

exports.remove = wrap(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return noContent(res);
});
