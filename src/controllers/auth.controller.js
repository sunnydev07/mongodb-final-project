const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const { ok, created } = require('../utils/response');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

exports.register = async (req, res) => {
  const user = await User.create({
    ...req.body,
    role: req.body.role || 'customer',
  });
  const token = signToken(user);
  return created(res, { user: user.toSafeObject(), token });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account disabled' });
  }
  const token = signToken(user);
  return ok(res, { user: user.toSafeObject(), token });
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user._id || req.user.id);
  if (!user) return res.status(401).json({ success: false, message: 'Account not found' });
  return ok(res, user.toSafeObject());
};
