# Testing

## 1. Approach

The project uses **Jest + Supertest integration tests against a real MongoDB database**. The tests exercise the HTTP layer end-to-end: routing, validation, JWT authentication, authorization, controllers, Mongoose models, indexes, and aggregation.

There are no mocked repositories. This is deliberate: the assignment is about MongoDB behaviour, and a real database catches schema/index/query mistakes that unit mocks would miss.

## 2. Test environment

Two setup files run before each suite:

| File | Purpose |
| --- | --- |
| `tests/env.setup.js` | `setupFiles`: sets `NODE_ENV=test`, test database URI, JWT secret, and a high rate limit **before** the app config is loaded |
| `tests/setup.js` | `setupFilesAfterEnv`: connects Mongoose, syncs indexes, clears collections at the start of each test file, disconnects after the file |

`jest.config.js`:

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/env.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 60000,
};
```

The default test database is:

```text
mongodb://127.0.0.1:27017/mongo_final_project_test
```

Override it with `MONGODB_TEST_URI`. **The test setup deletes collections in that database**, so never point it at development or production data.

## 3. Running

```bash
# Start MongoDB first
mongod --dbpath /path/to/data

# Run all tests
npm test

# Watch mode
npm run test:watch

# A single suite
npx jest tests/order.test.js --runInBand
```

`npm test` uses `jest --runInBand`. Serial execution avoids cross-file interference on the shared test database and keeps the output readable.

Expected result:

```text
Test Suites: 5 passed, 5 total
Tests:       30 passed, 30 total
Snapshots:   0 total
Time:        ~10 s
```

## 4. Suites

| Suite | Tests | What it verifies |
| --- | ---: | --- |
| `tests/auth.test.js` | 4 | Registration returns a token and hides the password; duplicate email → `409`; login + `/me`; invalid credentials → `401` |
| `tests/product.test.js` | 9 | Health check; seller creates product with derived `discountedPrice`; customer forbidden; filters/pagination; get by id; update recalculates discount; text search; analytics; seller cannot delete |
| `tests/order.test.js` | 7 | Order creation decrements stock; insufficient stock → `409`; customer sees only own orders; get by id; customer cannot change status; admin can (JWT signed directly); customer summary aggregate |
| `tests/user.test.js` | 4 | Self profile update; cross-user update → `403`; non-admin role escalation ignored; password change is hashed and usable at login |
| `tests/review.test.js` | 6 | Create review updates product rating; duplicate review → `409`; list with pagination; other user cannot edit; own update recalculates; delete resets rating |

Total: **30 tests**.

### Notable behaviours covered

- **Unique indexes**: duplicate email and duplicate review rely on schema-level unique indexes; `syncIndexes()` runs before the tests.
- **Derived fields**: product `discountedPrice`/`inStock` and review-driven `rating`/`reviewCount`.
- **RBAC and ownership**: seller/admin/customer boundaries and per-resource ownership checks.
- **Atomic stock**: order creation decrements stock and rejects quantities above available stock.
- **Aggregation**: product analytics and customer order summary.
- **Security regression**: profile updates cannot escalate a customer to admin, and password changes go through the hashing hook.

## 5. Test isolation

Each test file starts by clearing all collections:

```js
beforeAll(async () => {
  await connectDatabase(process.env.MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  for (const key of Object.keys(mongoose.connection.collections)) {
    await mongoose.connection.collections[key].deleteMany({});
  }
});
```

Because Jest runs files serially (`--runInBand`), one file's data cannot leak into another. Within a file, tests are ordered intentionally: for example, the order suite creates a product and order in `beforeAll`/the first test, then exercises reads and status changes.

## 6. Replica-set tests

The same suite can run against the local three-node set. This exercises the transaction path in order creation:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:28017,127.0.0.1:28018,127.0.0.1:28019/mongo_final_project_test?replicaSet=rs0'
npm test
```

Observed result: **5 suites, 30 tests passed**. The test setup creates indexes on the replica set and clears collections through the primary.

On a standalone server, `createOrder` uses the sequential fallback; the order tests still pass. This dual-mode behaviour is intentional.

## 7. Continuous integration

`.github/workflows/ci.yml` runs on pushes and pull requests:

- starts a `mongo:7` service on port 27017 with a `mongosh` health check;
- installs with `npm ci`;
- runs ESLint;
- runs all tests;
- seeds the database, creates indexes, and runs the benchmark.

This verifies the project from a clean checkout on every change.

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `MongooseServerSelectionError` / `ECONNREFUSED` | MongoDB is not running on the expected port; start `mongod` or update `MONGODB_TEST_URI` |
| `Missing required sub-document 'driver' in the client metadata document` | Driver bug under Jest (NODE-7832). `src/config/db.js` passes `runtimeAdapters: { os: require('os') }` as a workaround |
| Duplicate email/review tests fail | Unique indexes were not created; `tests/setup.js` calls `syncIndexes()`, so check that the connection succeeded |
| Tests hang after completion | An open Mongoose connection; `afterAll` disconnects, and `testTimeout` is 60s |
| One suite passes alone but fails in the full run | Check that the test file clears collections and does not assume order across files |
| `E11000` during seed | The database has conflicting unique values; `npm run seed` resets the relevant collections |
| Tests wiped the wrong database | `MONGODB_TEST_URI` points at a non-test database; restore from backup and fix the URI |

### Driver workaround note

The installed MongoDB Node driver (7.7) has a known handshake issue when running under Jest's module environment: the `driver` sub-document is omitted from client metadata. The repository applies the documented workaround in `src/config/db.js`:

```js
mongoose.connect(uri, {
  runtimeAdapters: { os: require('os') },
  // ...
});
```

Remove it once the upstream fix is released and verified.

## 9. Adding tests

1. Create `tests/<feature>.test.js`.
2. Use `request(app)` from Supertest; do not start a separate HTTP server.
3. Register users through `/api/auth/register` unless the test needs a role that registration forbids (admin); for admin, create the user model directly and sign a JWT with `process.env.JWT_SECRET`.
4. Assert status, envelope shape, and a database side effect where relevant (stock, rating, password hash).
5. Keep files independent; the shared database is cleared per file.

Example skeleton:

```js
const request = require('supertest');
const app = require('../src/app');

describe('Feature', () => {
  it('does the thing', async () => {
    const res = await request(app).get('/api/...');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

## 10. Gaps and next steps

The suite covers the main API paths but does not currently include:

- load/performance tests (the benchmark script is separate);
- failover tests inside Jest (failover was verified manually);
- refresh-token rotation and revocation;
- multi-item concurrent order stress tests;
- fuzzing of malformed query strings beyond Zod's happy-path checks;
- frontend/E2E tests (there is no frontend in this project).

These are reasonable next steps if the project evolves beyond the course scope.
