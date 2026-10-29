const request = require('supertest');
const app = require('../src/app');

async function register(payload) {
  const res = await request(app).post('/api/auth/register').send(payload);
  return res.body.data;
}

describe('Users', () => {
  let aliceToken;
  let aliceId;
  let bobToken;

  beforeAll(async () => {
    const alice = await register({
      name: 'Alice Profile',
      email: 'alice-profile@example.com',
      password: 'Password123!',
    });
    aliceToken = alice.token;
    aliceId = alice.user._id;

    const bob = await register({
      name: 'Bob Profile',
      email: 'bob-profile@example.com',
      password: 'Password123!',
    });
    bobToken = bob.token;
  });

  it('updates own profile', async () => {
    const res = await request(app)
      .patch(`/api/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Alice Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Alice Updated');
    expect(res.body.data.password).toBeUndefined();
  });

  it("forbids updating another user's profile", async () => {
    const res = await request(app)
      .patch(`/api/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('ignores role escalation from a non-admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('customer');
  });

  it('hashes a password changed through the profile endpoint', async () => {
    const res = await request(app)
      .patch(`/api/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ password: 'NewPassword123!' });
    expect(res.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice-profile@example.com', password: 'NewPassword123!' });
    expect(login.status).toBe(200);
  });
});
