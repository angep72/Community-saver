const { body, validationResult } = require('express-validator');

// Handle validation errors
exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
exports.validateRegister = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(['admin', 'branch_lead', 'member'])
    .withMessage('Role must be admin, branch_lead, or member')
];

exports.validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Contribution validation rules
exports.validateContribution = [
  body('memberId')
    .isMongoId()
    .withMessage('Invalid member ID'),
  // body('amount')
  //   .isFloat({ min: 1 })
  //   .withMessage('Amount must be greater than 0'),
  body('contributionType')
    .optional()
    .isIn(['monthly', 'weekly', 'special', 'penalty_payment'])
    .withMessage('Invalid contribution type'),
  body('description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters')
];

// Loan validation rules
exports.validateLoan = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be greater than 0'),
  body('duration')
    .isInt({ min: 1, max: 60 })
    .withMessage('Duration must be between 1 and 60 months')
];

exports.validateLoanApproval = [
  body('status')
    .isIn(['approved', 'rejected'])
    .withMessage('Status must be approved or rejected'),
  // body('rejectionReason')
  //   .if(body('status').equals('rejected'))
  //   .notEmpty()
  //   .withMessage('Rejection reason is required when rejecting loan')
];

// Penalty validation rules
exports.validatePenalty = [
  body('member')
    .isMongoId()
    .withMessage('Invalid member ID'),
  // body('amount')
  //   .isFloat({ min: 1 })
  //   .withMessage('Amount must be greater than 0'),
  body('reason')
    .isIn(['late_contribution', 'missed_meeting', 'late_loan_repayment', 'policy_violation', 'other'])
    .withMessage('Invalid penalty reason'),
  body('description')
    .optional()
    .isLength({ max: 300 })
    .withMessage('Description cannot exceed 300 characters')
];