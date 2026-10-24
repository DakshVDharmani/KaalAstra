/**
 * Authentication Middleware for internal and customer routes
 */
function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }
  const token = authHeader.split(' ')[1];
  if (token === 'valid-user-token') {
    req.user = { id: 'usr_123', role: 'customer' };
    return next();
  } else if (token === 'valid-admin-token') {
    req.user = { id: 'admin_999', role: 'admin' };
    return next();
  }
  return res.status(403).json({ error: 'Forbidden: Invalid credentials' });
}

module.exports = { authenticateUser };
