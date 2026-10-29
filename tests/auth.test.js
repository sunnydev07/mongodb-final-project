const request = require('supertest');
const app = require('../src/app');

describe('Auth', () => {
  it('registers a new customer and returns token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'Password123!',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'Password123!',
    });
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bob2',
      email: 'bob@example.com',
      password: 'Password123!',
    });
    expect(res.status).toBe(409);
  });

  it('logs in and fetches profile', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Carol',
      email: 'carol@example.com',
      password: 'Password123!',
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'carol@example.com',
      password: 'Password123!',
    });
    expect(login.status).toBe(200);
    const token = login.body.data.token;
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('carol@example.com');
  });

  it('rejects invalid credentials', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Dave',
      email: 'dave@example.com',
      password: 'Password123!',
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'dave@example.com',
      password: 'wrong',
    });
    expect(res.status).toBe(401);
  });
});
