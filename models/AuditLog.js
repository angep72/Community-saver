const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: [
      'login', 'logout', 'register',
      'create_user', 'update_user', 'delete_user',
      'add_contribution', 'update_contribution', 'delete_contribution',
      'request_loan', 'approve_loan', 'reject_loan', 'update_loan',
      'assign_penalty', 'pay_penalty', 'waive_penalty',
      'create_branch', 'update_branch', 'delete_branch','disburse_loan'
    ]
  },
  resource: {
    type: String,
    required: [true, 'Resource is required'],
    enum: ['user', 'contribution', 'loan', 'penalty', 'branch', 'auth']
  },
  resourceId: {
    type: mongoose.Schema.ObjectId,
    default: null
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Index for efficient querying
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);