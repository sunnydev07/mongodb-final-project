const Product = require('../models/Product');
const Review = require('../models/Review');
const { ok, created, noContent } = require('../utils/response');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { productQuerySchema } = require('../validators/product.validators');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.create = wrap(async (req, res) => {
  const payload = { ...req.body };
  // The seller identity always comes from the authenticated user.
  payload.seller = {
    ...(payload.seller || {}),
    id: req.user._id || req.user.id,
    name: req.user.name,
  };
  if (payload.coordinates) {
    payload.location = { type: 'Point', coordinates: payload.coordinates };
    delete payload.coordinates;
  }
  const product = await Product.create(payload);
  return created(res, product);
});

exports.list = wrap(async (req, res) => {
  const parsed = productQuerySchema.parse(req.query);
  const { page, limit, skip } = parsePagination(parsed);

  const filter = {};
  if (parsed.category) filter.category = parsed.category;
  if (parsed.brand) filter.brand = parsed.brand;
  if (parsed.tag) filter.tags = parsed.tag;
  if (parsed.inStock !== undefined) filter.inStock = parsed.inStock;
  if (parsed.isActive !== undefined) filter.isActive = parsed.isActive;
  if (parsed.featured !== undefined) filter.isFeatured = parsed.featured;
  if (parsed.minPrice !== undefined || parsed.maxPrice !== undefined) {
    filter.price = {};
    if (parsed.minPrice !== undefined) filter.price.$gte = parsed.minPrice;
    if (parsed.maxPrice !== undefined) filter.price.$lte = parsed.maxPrice;
  }
  if (parsed.search) {
    filter.$text = { $search: parsed.search };
  }

  const sortMap = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1 },
    newest: { createdAt: -1 },
    name: { name: 1 },
  };
  let sort = sortMap[parsed.sort] || { createdAt: -1 };
  if (parsed.search) {
    sort = { score: { $meta: 'textScore' }, ...sort };
  }

  let query = Product.find(filter).sort(sort).skip(skip).limit(limit);
  if (parsed.search) query = query.select({ score: { $meta: 'textScore' } });

  let geoQuery = null;
  if (parsed.near) {
    const [lng, lat, maxDistance] = parsed.near.split(',').map(Number);
    geoQuery = Product.find({
      ...filter,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: maxDistance || 10000,
        },
      },
    })
      .skip(skip)
      .limit(limit);
  }

  const finalQuery = geoQuery || query;
  const [products, total] = await Promise.all([finalQuery.lean(), Product.countDocuments(filter)]);
  return ok(res, products, 200, buildMeta(total, page, limit));
});

exports.getById = wrap(async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  return ok(res, product);
});

exports.update = wrap(async (req, res) => {
  const payload = { ...req.body };
  if (payload.coordinates) {
    payload.location = { type: 'Point', coordinates: payload.coordinates };
    delete payload.coordinates;
  }
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  const callerId = String(req.user._id || req.user.id);
  if (req.user.role !== 'admin' && String(product.seller?.id) !== callerId) {
    return res.status(403).json({ success: false, message: 'You can only update your own products' });
  }

  if (req.user.role !== 'admin') delete payload.seller;
  Object.assign(product, payload);
  await product.save();
  return ok(res, product);
});

exports.remove = wrap(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  await Review.deleteMany({ product: product._id });
  return noContent(res);
});

exports.aggregations = wrap(async (req, res) => {
  const [
    byCategory,
    byBrand,
    priceBuckets,
    topRated,
    inventorySummary,
  ] = await Promise.all([
    Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          products: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          avgRating: { $avg: '$rating' },
          totalStock: { $sum: '$stock' },
        },
      },
      { $sort: { products: -1 } },
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$brand',
          products: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { products: -1 } },
      { $limit: 10 },
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      {
        $bucket: {
          groupBy: '$price',
          boundaries: [0, 1000, 5000, 10000, 25000, 50000, 100000],
          default: '100000+',
          output: {
            count: { $sum: 1 },
            avgRating: { $avg: '$rating' },
          },
        },
      },
    ]),
    Product.aggregate([
      { $match: { isActive: true } },
      { $sort: { rating: -1, reviewCount: -1 } },
      { $limit: 5 },
      { $project: { name: 1, brand: 1, category: 1, rating: 1, reviewCount: 1, price: 1 } },
    ]),
    Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: ['$isActive', 1, 0] } },
          inStockProducts: { $sum: { $cond: ['$inStock', 1, 0] } },
          inventoryValue: { $sum: { $multiply: ['$price', '$stock'] } },
          avgPrice: { $avg: '$price' },
        },
      },
    ]),
  ]);

  return ok(res, { byCategory, byBrand, priceBuckets, topRated, inventorySummary });
});
