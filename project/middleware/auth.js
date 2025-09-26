const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authenticate user
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    const user = await User.findById(decoded.id).populate('branch');
    
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Token is invalid. User not found.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        status: 'error',
        message: 'Account is deactivated. Contact administrator.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token is invalid'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Authentication error',
      error: error.message
    });
  }
};

// Authorize user roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    next();
  };
};

// Check if user can access branch data
exports.checkBranchAccess = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    
    // Admin can access all branches
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Branch lead can only access their branch
    if (req.user.role === 'branch_lead') {
      if (req.user.branch._id.toString() !== branchId) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. You can only access your branch data.'
        });
      }
    }
    
    // Members can only access their own branch
    if (req.user.role === 'member') {
      if (req.user.branch._id.toString() !== branchId) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. You can only access your branch data.'
        });
      }
    }
    
    next();
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Branch access check error',
      error: error.message
    });
  }
};