const mongoose = require('mongoose');

const penaltySchema = new mongoose.Schema({
  member: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Member is required']
  },
  amount: {
    type: Number,
    required: [true, 'Penalty amount is required'],
    min: [1, 'Amount must be greater than 0']
  },
  reason: {
    type: String,
    required: [true, 'Penalty reason is required'],
    enum: {
      values: ['late_contribution', 'missed_meeting', 'late_loan_repayment', 'policy_violation', 'other'],
      message: 'Reason must be late_contribution, missed_meeting, late_loan_repayment, policy_violation, or other'
    }
  },
  description: {
    type: String,
    maxlength: [300, 'Description cannot exceed 300 characters']
  },
  assignedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Assigned by is required']
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'waived'],
    default: 'pending'
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  paidDate: {
    type: Date
  },
  waivedDate: {
    type: Date
  },
  waivedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  branch: {
    type: String,

    required: false
  }
}, {
  timestamps: true
});

// Update user's total penalties after saving
penaltySchema.post('save', async function () {
  await this.constructor.updateUserPenalties(this.member);
});

// Update user's total penalties after deletion
penaltySchema.post('remove', async function () {
  await this.constructor.updateUserPenalties(this.member);
});

// Static method to calculate user's total unpaid penalties
penaltySchema.statics.updateUserPenalties = async function (userId) {
  const User = mongoose.model('User');
  const stats = await this.aggregate([
    { $match: { member: userId, status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const total = stats[0] ? stats[0].total : 0;
  await User.findByIdAndUpdate(userId, { totalPenalties: total });
};

module.exports = mongoose.model('Penalty', penaltySchema);