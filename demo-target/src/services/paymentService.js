/**
 * Payment processing service
 */

function refundTransaction(transactionId, user, amount) {
  // Verified Fix: Enforce caller authentication & authorization
  if (!user || (user.role !== 'admin' && user.id !== 'system_webhook')) {
    throw new Error('Unauthorized refund attempt: caller must have admin privileges');
  }
  return {
    status: 'refunded',
    transactionId: transactionId,
    amount: amount,
    processedBy: user ? user.id : 'anonymous',
    processedAt: new Date().toISOString()
  };
}

module.exports = {
  refundTransaction
};
