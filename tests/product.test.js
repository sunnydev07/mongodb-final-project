const request = require('supertest');
const app = require('../src/app');

async function registerUser(payload) {
  const res = await request(app).post('/api/auth/register').send(payload);
  return res.body.data;
}

describe('Products', () => {
  let sellerToken;
  let productId;

  beforeAll(async () => {
    const seller = await registerUser({
      name: 'Seller Sam',
      email: 'seller@example.com',
      password: 'Password123!',
      role: 'seller',
    });
    sellerToken = seller.token;
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('creates a product (seller)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        sku: 'TEST-001',
        name: 'Test Phone',
        description: 'A test smartphone with great features and battery life',
        category: 'Mobiles',
        brand: 'Samsung',
        price: 10000,
        stock: 50,
        tags: ['new', 'featured'],
      });
    expect(res.status).toBe(201);
    productId = res.body.data._id;
    expect(res.body.data.discountedPrice).toBe(10000);
  });

  it('rejects creation by customer', async () => {
    const cust = await registerUser({
      name: 'Cust',
      email: 'cust@example.com',
      password: 'Password123!',
    });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${cust.token}`)
      .send({
        sku: 'X',
        name: 'X',
        description: 'x',
        category: 'C',
        brand: 'B',
        price: 1,
        stock: 1,
      });
    expect(res.status).toBe(403);
  });

  it('lists products with filters and pagination', async () => {
    const res = await request(app).get('/api/products?category=Mobiles&minPrice=5000&page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeTruthy();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('gets product by id', async () => {
    const res = await request(app).get(`/api/products/${productId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Test Phone');
  });

  it('updates product', async () => {
    const res = await request(app)
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ price: 9000, discountPercentage: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(9000);
    expect(res.body.data.discountedPrice).toBe(8100);
  });

  it('text search works', async () => {
    const res = await request(app).get('/api/products?search=smartphone');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('analytics overview returns aggregates', async () => {
    const res = await request(app).get('/api/products/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.data.byCategory).toBeTruthy();
  });

  it('forbids product deletion by seller', async () => {
    const res = await request(app)
      .delete(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(res.status).toBe(403);
    // cleanup not essential
  });
});
