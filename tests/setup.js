const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const mongoose = require('mongoose');
require('../src/models/User');
require('../src/models/Product');
require('../src/models/Order');
require('../src/models/Review');

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/mongo_final_project_test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.RATE_LIMIT_MAX = '10000';
  await connectDatabase(process.env.MONGODB_URI);
  // Ensure indexes exist for unique-constraint tests.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  // Isolate test files: each file starts with a clean database.
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await disconnectDatabase();
});
