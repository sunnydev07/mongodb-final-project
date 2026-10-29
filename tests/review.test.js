const request = require('supertest');
const app = require('../src/app');

async function register(payload) {
  const res = await request(app).post('/api/auth/register').send(payload);
  return res.body.data;
}

describe('Reviews', () => {
  let customerToken;
  let otherToken;
  let productId;
  let reviewId;

  beforeAll(async () => {
    const seller = await register({
      name: 'Review Seller',
      email: 'review-seller@example.com',
      password: 'Password123!',
      role: 'seller',
    });
    const product = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        sku: 'REV-001',
        name: 'Review Product',
        description: 'A product used for review endpoint tests',
        category: 'Electronics',
        brand: 'Sony',
        price: 2500,
        stock: 5,
      });
    productId = product.body.data._id;

    const customer = await register({
      name: 'Review Customer',
      email: 'review-customer@example.com',
      password: 'Password123!',
    });
    customerToken = customer.token;

    const other = await register({
      name: 'Other Customer',
      email: 'other-customer@example.com',
      password: 'Password123!',
    });
    otherToken = other.token;
  });

  it('creates a review and updates the product rating', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 5, title: 'Excellent', comment: 'Works as advertised.' });
    expect(res.status).toBe(201);
    expect(res.body.data.verifiedPurchase).toBe(false);
    reviewId = res.body.data._id;

    const product = await request(app).get(`/api/products/${productId}`);
    expect(product.body.data.rating).toBe(5);
    expect(product.body.data.reviewCount).toBe(1);
  });

  it('rejects a duplicate review from the same user', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 4 });
    expect(res.status).toBe(409);
  });

  it('lists reviews for a product', async () => {
    const res = await request(app).get(`/api/products/${productId}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it("forbids editing another user's review", async () => {
    const res = await request(app)
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 1 });
    expect(res.status).toBe(403);
  });

  it('updates own review and recalculates the rating', async () => {
    const res = await request(app)
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.rating).toBe(3);

    const product = await request(app).get(`/api/products/${productId}`);
    expect(product.body.data.rating).toBe(3);
  });

  it('deletes own review and resets the rating', async () => {
    const res = await request(app)
      .delete(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(204);

    const product = await request(app).get(`/api/products/${productId}`);
    expect(product.body.data.rating).toBe(0);
    expect(product.body.data.reviewCount).toBe(0);
  });
});
