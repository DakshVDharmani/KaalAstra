const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { refundTransaction } = require('../services/paymentService');

/**
 * Standard Customer/Admin API Routes
 */
router.post('/refund', authenticateUser, (req, res) => {
  try {
    const { transactionId, amount } = req.body;
    // Passes authenticated req.user down to service
    const result = refundTransaction(transactionId, req.user, amount);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
});

module.exports = router;
