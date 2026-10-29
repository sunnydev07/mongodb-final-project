const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { ok, created, noContent } = require('../utils/response');
const { parsePagination, buildMeta } = require('../utils/pagination');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function refreshProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: '$product', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const avg = stats[0]?.avgRating || 0;
  const count = stats[0]?.count || 0;
  await Product.updateOne(
    { _id: productId },
    { $set: { rating: Math.round(avg * 10) / 10, reviewCount: count } }
  );
}

exports.listByProduct = wrap(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  if (!mongoose.isValidObjectId(req.params.productId)) {
    return res.status(400).json({ success: false, message: 'Invalid product id' });
  }
  const filter = { product: req.params.productId };
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name')
      .lean(),
    Review.countDocuments(filter),
  ]);
  return ok(res, reviews, 200, buildMeta(total, page, limit));
});

exports.create = wrap(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ success: false, message: 'Invalid product id' });
  }
  const product = await Product.exists({ _id: productId });
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  const userId = req.user._id || req.user.id;
  const existing = await Review.findOne({ product: productId, user: userId });
  if (existing) {
    return res.status(409).json({ success: false, message: 'You have already reviewed this product' });
  }

  const verifiedPurchase = Boolean(
    await Order.exists({ customer: userId, 'items.product': productId })
  );

  const review = await Review.create({
    ...req.body,
    product: productId,
    user: userId,
    verifiedPurchase,
  });
  await refreshProductRating(productId);
  return created(res, review);
});

exports.update = wrap(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

  const callerId = String(req.user._id || req.user.id);
  if (req.user.role !== 'admin' && String(review.user) !== callerId) {
    return res.status(403).json({ success: false, message: 'You can only edit your own review' });
  }

  Object.assign(review, req.body);
  await review.save();
  await refreshProductRating(review.product);
  return ok(res, review);
});

exports.remove = wrap(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

  const callerId = String(req.user._id || req.user.id);
  if (req.user.role !== 'admin' && String(review.user) !== callerId) {
    return res.status(403).json({ success: false, message: 'You can only delete your own review' });
  }

  const productId = review.product;
  await review.deleteOne();
  await refreshProductRating(productId);
  return noContent(res);
});
