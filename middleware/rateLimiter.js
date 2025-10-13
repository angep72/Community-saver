const rateLimit = require('express-rate-limit');

const authenticatedLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute for authenticated users
  message: 'Too many requests from this IP, please try again after a minute',
  skip: (req) => req.user && req.user.role === 'admin' // Optionally skip admins
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute for public endpoints
  message: 'Too many requests from this IP, please try again after a minute'
});

module.exports = {
  authenticatedLimiter,
  publicLimiter
};
