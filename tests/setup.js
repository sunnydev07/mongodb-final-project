const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const mongoose = require('mongoose');
require('../src/models/User');
require('../src/models/Product');
require('../src/models/Order');
require('../src/models/Review');

beforeAll(async () => {
  await connectDatabase();
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
