const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

describe('Orders', () => {
  let sellerToken;
  let customerToken;
  let customerId;
  let productId;
  let orderId;

  beforeAll(async () => {
    const sellerRes = await request(app).post('/api/auth/register').send({
      name: 'Seller S',
      email: 'seller2@example.com',
      password: 'Password123!',
      role: 'seller',
    });
    sellerToken = sellerRes.body.data.token;

    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        sku: 'ORDER-PROD-1',
        name: 'Order Product',
        description: 'Product for order flow tests',
        category: 'Electronics',
        brand: 'Sony',
        price: 5000,
        stock: 10,
      });
    productId = prodRes.body.data._id;

    const custRes = await request(app).post('/api/auth/register').send({
      name: 'Cust O',
      email: 'custo@example.com',
      password: 'Password123!',
    });
    customerToken = custRes.body.data.token;
    customerId = custRes.body.data.user._id;
  });

  it('creates an order and decrements stock', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId, quantity: 2 }],
        paymentMethod: 'UPI',
      });
    expect(res.status).toBe(201);
    orderId = res.body.data._id;
    expect(res.body.data.totalAmount).toBe(10000);

    const prod = await request(app).get(`/api/products/${productId}`);
    expect(prod.body.data.stock).toBe(8);
  });

  it('rejects order when insufficient stock', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId, quantity: 100 }],
        paymentMethod: 'UPI',
      });
    expect(res.status).toBe(409);
  });

  it('customer lists own orders', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('gets order by id', async () => {
    const res = await request(app).get(`/api/orders/${orderId}`).set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.orderNumber).toBeTruthy();
  });

  it('forbids status update by customer', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'shipped' });
    expect(res.status).toBe(403);
  });

  it('admin can update order status (seeded admin)', async () => {
    const admin = await User.create({
      name: 'Admin Test',
      email: 'admintest@example.com',
      password: 'AdminPass123!',
      role: 'admin',
    });
    const adminToken = signToken(admin);
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shipped', paymentStatus: 'completed', transactionId: 'TXN123' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('shipped');
  });

  it('customer summary aggregates', async () => {
    const res = await request(app)
      .get(`/api/orders/customer/${customerId}/summary`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toBe(1);
  });
});
