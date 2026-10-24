const request = require('supertest');
const app = require('../src/server');

describe('Payment & Refund Processing Integration Tests', () => {
  test('Unauthenticated user cannot trigger /api/refund', async () => {
    const res = await request(app)
      .post('/api/refund')
      .send({ transactionId: 'tx_100', amount: 50 });
    
    expect(res.status).toBe(401);
  });

  test('Customer role is forbidden from triggering /api/refund', async () => {
    const res = await request(app)
      .post('/api/refund')
      .set('Authorization', 'Bearer valid-user-token')
      .send({ transactionId: 'tx_100', amount: 50 });
    
    expect(res.status).toBe(403);
  });

  test('Admin user can successfully trigger /api/refund', async () => {
    const res = await request(app)
      .post('/api/refund')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ transactionId: 'tx_100', amount: 50 });
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('refunded');
    expect(res.body.transactionId).toBe('tx_100');
  });

  test('Stripe webhook handles charge.dispute.created callback', async () => {
    const res = await request(app)
      .post('/webhooks/stripe-callback')
      .send({
        type: 'charge.dispute.created',
        data: { transactionId: 'tx_999', amount: 150 }
      });
    
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
