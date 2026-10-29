const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const Review = require('../src/models/Review');
const env = require('../src/config/env');

const categories = ['Electronics', 'Mobiles', 'Laptops', 'Home Appliances', 'Fashion', 'Books', 'Sports', 'Beauty', 'Grocery', 'Furniture'];
const brands = ['Samsung', 'Apple', 'Sony', 'LG', 'HP', 'Dell', 'Lenovo', 'Nike', 'Adidas', 'Boat', 'OnePlus', 'AmazonBasics'];
const cities = ['Chennai', 'Coimbatore', 'Bangalore', 'Hyderabad', 'Mumbai', 'Delhi', 'Pune', 'Kochi', 'Kolkata', 'Ahmedabad'];
const sellers = ['RetailHub', 'TechWorld', 'MegaStore', 'DigitalMart', 'SmartShop', 'PrimeRetail'];
const tags = ['new', 'popular', 'trending', 'premium', 'budget', 'best-seller', 'discount', 'limited-stock'];

const SUBCATS = {
  Electronics: ['Headphones', 'Smartwatch', 'Camera', 'Speaker'],
  Mobiles: ['Android', 'iPhone', 'Feature Phone'],
  Laptops: ['Gaming', 'Business', 'Student'],
  'Home Appliances': ['Refrigerator', 'Washing Machine', 'Microwave'],
  Fashion: ['Men', 'Women', 'Kids'],
  Books: ['Programming', 'Fiction', 'Education'],
  Sports: ['Cricket', 'Football', 'Fitness'],
  Beauty: ['Skincare', 'Haircare', 'Makeup'],
  Grocery: ['Snacks', 'Beverages', 'Staples'],
  Furniture: ['Chair', 'Table', 'Sofa'],
};

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function seedUsers() {
  await User.deleteMany({});
  await Review.deleteMany({});
  const users = [];
  for (let i = 1; i <= 40; i++) {
    users.push({
      name: `Customer ${i}`,
      email: `customer${i}@example.com`,
      password: 'Password123!',
      role: i % 10 === 0 ? 'seller' : 'customer',
      addresses: [
        { label: 'home', street: `${i} Main St`, city: rnd(cities), state: 'State', country: 'India', isDefault: true },
      ],
      isActive: true,
    });
  }
  // admin
  users.push({ name: 'Admin', email: 'admin@example.com', password: 'AdminPass123!', role: 'admin', isActive: true });
  await User.create(users);
  return User.find();
}

async function seedProducts(users) {
  await Product.deleteMany({});
  const sellersList = users.filter((u) => u.role === 'seller');
  const products = [];
  for (let i = 1; i <= 500; i++) {
    const category = rnd(categories);
    const subCategory = rnd(SUBCATS[category]);
    const brand = rnd(brands);
    const price = Math.floor(Math.random() * 95000) + 500;
    const discount = [0, 5, 10, 15, 20, 30][Math.floor(Math.random() * 6)];
    const stock = Math.floor(Math.random() * 500);
    const seller = sellersList.length ? rnd(sellersList) : null;
    products.push({
      sku: `SKU-${String(i).padStart(6, '0')}`,
      name: `${brand} ${subCategory} ${i}`,
      description: `High quality ${category} product from ${brand}. Sub-category ${subCategory}. Ideal for everyday use with excellent performance and warranty.`,
      category,
      subCategory,
      brand,
      price,
      discountPercentage: discount,
      stock,
      tags: [rnd(tags), rnd(tags)],
      images: [`https://picsum.photos/seed/${i}/400/300`],
      rating: Number((Math.random() * 4 + 1).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 300),
      seller: {
        id: seller ? seller._id : null,
        name: seller ? seller.name : rnd(sellers),
        rating: Number((Math.random() * 4 + 1).toFixed(1)),
      },
      specifications: {
        warranty: `${Math.floor(Math.random() * 3) + 1} years`,
        color: rnd(['Black', 'White', 'Blue', 'Red', 'Silver']),
        weight: Number((Math.random() * 5 + 0.5).toFixed(2)),
      },
      location: { type: 'Point', coordinates: [77 + Math.random() * 2, 11 + Math.random() * 2] },
      isFeatured: Math.random() > 0.85,
      isActive: Math.random() > 0.05,
    });
  }
  await Product.create(products);
}

async function seedReviews(users, products) {
  const customers = users.filter((u) => u.role === 'customer');
  const titles = ['Great value', 'Works well', 'Not bad', 'Excellent', 'Would buy again', 'Average'];
  const comments = [
    'Exactly as described and delivered on time.',
    'Good quality for the price.',
    'Works well for everyday use.',
    'Packaging was good and the product is solid.',
    'Decent product, but delivery took a while.',
  ];
  const reviews = [];
  const seen = new Set();

  for (let i = 0; i < 160; i++) {
    const user = rnd(customers);
    const product = rnd(products);
    const key = `${user._id}-${product._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviews.push({
      product: product._id,
      user: user._id,
      rating: Math.ceil(Math.random() * 5),
      title: rnd(titles),
      comment: rnd(comments),
      verifiedPurchase: Math.random() > 0.4,
    });
  }

  await Review.create(reviews);

  // Recompute denormalized product ratings from the seeded reviews.
  await Product.updateMany({}, { $set: { rating: 0, reviewCount: 0 } });
  const stats = await Review.aggregate([
    { $group: { _id: '$product', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  if (stats.length) {
    await Product.bulkWrite(
      stats.map((s) => ({
        updateOne: {
          filter: { _id: s._id },
          update: {
            $set: { rating: Math.round(s.avgRating * 10) / 10, reviewCount: s.count },
          },
        },
      }))
    );
  }
  return reviews.length;
}

async function seedOrders(users, products) {
  await Order.deleteMany({});
  const customers = users.filter((u) => u.role === 'customer');
  const orders = [];
  for (let i = 1; i <= 60; i++) {
    const customer = rnd(customers);
    const itemCount = Math.floor(Math.random() * 4) + 1;
    const chosen = [];
    for (let j = 0; j < itemCount; j++) chosen.push(rnd(products));
    const items = chosen.map((p) => ({
      product: p._id,
      sku: p.sku,
      name: p.name,
      quantity: Math.floor(Math.random() * 3) + 1,
      unitPrice: p.discountedPrice || p.price,
      lineTotal: 0,
    }));
    items.forEach((it) => (it.lineTotal = it.unitPrice * it.quantity));
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const tax = Math.round(subtotal * 0.18);
    const shippingCost = subtotal > 5000 ? 0 : 99;
    orders.push({
      orderNumber: `ORD-SEED-${String(i).padStart(4, '0')}`,
      customer: customer._id,
      items,
      subtotal,
      tax,
      shippingCost,
      totalAmount: subtotal + tax + shippingCost,
      payment: { method: rnd(['UPI', 'card', 'cod']), status: 'completed', paidAt: new Date() },
      shippingAddress: { city: rnd(cities), country: 'India' },
      status: rnd(['pending', 'processing', 'shipped', 'delivered', 'delivered', 'delivered']),
      orderDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
    });
  }
  await Order.create(orders);
}

async function main() {
  await connectDatabase(env.MONGODB_URI);
  console.log('Seeding users...');
  const users = await seedUsers();
  console.log(`Seeded ${users.length} users.`);
  console.log('Seeding products...');
  await seedProducts(users);
  console.log('Seeded 500 products.');
  const allProducts = await Product.find().lean();
  console.log('Seeding orders...');
  await seedOrders(users, allProducts);
  console.log('Seeded 60 orders.');
  console.log('Seeding reviews...');
  const reviewCount = await seedReviews(users, allProducts);
  console.log(`Seeded ${reviewCount} reviews.`);
  await disconnectDatabase();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
