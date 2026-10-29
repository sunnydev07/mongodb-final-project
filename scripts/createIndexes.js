const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const Order = require('../src/models/Order');
const Review = require('../src/models/Review');

async function main() {
  await connectDatabase();
  console.log('Creating indexes...');
  await Promise.all([
    User.syncIndexes(),
    Product.syncIndexes(),
    Order.syncIndexes(),
    Review.syncIndexes(),
  ]);
  console.log('Indexes created/synced.');
  const collections = [
    { name: 'users', model: User },
    { name: 'products', model: Product },
    { name: 'orders', model: Order },
    { name: 'reviews', model: Review },
  ];
  for (const c of collections) {
    const indexes = await c.model.collection.indexes();
    console.log(`\n${c.name} indexes:`);
    indexes.forEach((idx) => console.log('  -', idx.name, JSON.stringify(idx.key)));
  }
  await disconnectDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
