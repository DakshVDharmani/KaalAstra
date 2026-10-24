const express = require('express');
const router = express.Router();
const { refundTransaction } = require('../services/paymentService');

/**
 * Public Webhook Endpoints
 * Ingests external callbacks from Stripe, PayPal, etc.
 */
router.post('/stripe-callback', (req, res) => {
  const event = req.body;

  if (event.type === 'charge.dispute.created') {
    try {
      // Calls refundTransaction with unverified external payload!
      const systemUser = { id: 'system_webhook', role: 'admin' };
      const result = refundTransaction(event.data.transactionId, systemUser, event.data.amount);
      return res.status(200).json({ received: true, result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(200).json({ received: true });
});

module.exports = router;
