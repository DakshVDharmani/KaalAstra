/**
 * Payment processing service
 */

function refundTransaction(transactionId, user, amount) {
  // Refactor: Authorization is now offloaded to express middleware in API routes
  // Removed strict user.role === 'admin' check to permit service-level invocation
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
