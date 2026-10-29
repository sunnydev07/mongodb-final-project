const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { ok, created, noContent } = require('../utils/response');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { generateOrderNumber } = require('../utils/orderNumber');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function supportsTransactions() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    return false;
  }
}

exports.create = wrap(async (req, res) => {
  const { items, paymentMethod, shippingAddress, tax, shippingCost } = req.body;

  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const orderItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return res.status(404).json({ success: false, message: `Product not found: ${item.productId}` });
    }
    if (product.stock < item.quantity) {
      return res.status(409).json({
        success: false,
        message: `Insufficient stock for ${product.name}: requested ${item.quantity}, available ${product.stock}`,
      });
    }
    const unitPrice = product.discountedPrice || product.price;
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    orderItems.push({
      product: product._id,
      sku: product.sku,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    });
  }

  const finalTax = tax || 0;
  const finalShipping = shippingCost || 0;
  const totalAmount = subtotal + finalTax + finalShipping;

  // Transactions require a replica set; fall back to sequential writes on standalone.
  const session = (await supportsTransactions()) ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const order = await Order.create(
      [
        {
          orderNumber: generateOrderNumber(),
          customer: req.user._id || req.user.id,
          items: orderItems,
          subtotal,
          tax: finalTax,
          shippingCost: finalShipping,
          totalAmount,
          payment: { method: paymentMethod, status: 'pending' },
          shippingAddress,
          status: 'pending',
        },
      ],
      session ? { session } : undefined
    );

    for (const item of items) {
      await Product.updateOne(
        { _id: item.productId, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        session ? { session } : undefined
      );
    }

    if (session) await session.commitTransaction();
    return created(res, order[0]);
  } catch (err) {
    if (session) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
});

exports.list = wrap(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customer) filter.customer = req.query.customer;

  // Customers can only view their own orders unless admin.
  if (req.user.role !== 'admin') {
    filter.customer = req.user._id || req.user.id;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('customer', 'name email'),
    Order.countDocuments(filter),
  ]);
  return ok(res, orders, 200, buildMeta(total, page, limit));
});

exports.getById = wrap(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('customer', 'name email')
    .populate('items.product', 'name sku images');
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  const ownerId = order.customer?._id ? order.customer._id.toString() : order.customer.toString();
  const callerId = String(req.user._id || req.user.id);
  if (req.user.role === 'customer' && ownerId !== callerId) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  return ok(res, order);
});

exports.updateStatus = wrap(async (req, res) => {
  const { status, cancellationReason } = req.body;
  const update = { status };
  if (status === 'cancelled') {
    update.cancelledAt = new Date();
    if (cancellationReason) update.cancellationReason = cancellationReason;
    // Restore stock.
    const order = await Order.findById(req.params.id);
    if (order && order.status !== 'cancelled') {
      for (const item of order.items) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
      }
    }
  }
  if (status === 'delivered') update.deliveredAt = new Date();
  if (req.body.paymentStatus) update['payment.status'] = req.body.paymentStatus;
  if (req.body.transactionId) update['payment.transactionId'] = req.body.transactionId;

  const order = await Order.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after', runValidators: true });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  return ok(res, order);
});

exports.remove = wrap(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  return noContent(res);
});

exports.stats = wrap(async (req, res) => {
  const pipeline = [
    {
      $group: {
        _id: '$status',
        orders: { $sum: 1 },
        revenue: { $sum: '$totalAmount' },
        avgOrderValue: { $avg: '$totalAmount' },
      },
    },
    { $sort: { orders: -1 } },
  ];
  const byStatus = await Order.aggregate(pipeline);

  const dailyRevenue = await Order.aggregate([
    { $match: { status: { $in: ['delivered', 'shipped', 'processing'] } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderDate' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$totalAmount' },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 30 },
  ]);

  const topProducts = await Order.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        quantitySold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);

  return ok(res, { byStatus, dailyRevenue, topProducts });
});

exports.customerSummary = wrap(async (req, res) => {
  const customerId = req.params.id;
  if (!mongoose.isValidObjectId(customerId)) {
    return res.status(400).json({ success: false, message: 'Invalid customer id' });
  }
  const callerId = String(req.user._id || req.user.id);
  if (req.user.role !== 'admin' && callerId !== String(customerId)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const summary = await Order.aggregate([
    { $match: { customer: new mongoose.Types.ObjectId(customerId) } },
    {
      $group: {
        _id: '$customer',
        orders: { $sum: 1 },
        totalSpent: { $sum: '$totalAmount' },
        avgOrderValue: { $avg: '$totalAmount' },
        firstOrder: { $min: '$orderDate' },
        lastOrder: { $max: '$orderDate' },
      },
    },
  ]);
  return ok(res, summary[0] || { orders: 0, totalSpent: 0 });
});
