const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  member: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Member is required']
  },
  amount: {
    type: Number,
    required: [true, 'Loan amount is required'],
    min: [1, 'Amount must be greater than 0']
  },
  interestRate: {
    type: Number,
    required: [false, 'Interest rate is required'],
    min: [0, 'Interest rate cannot be negative'],
    max: [100, 'Interest rate cannot exceed 100%']
  },
  duration: {
    type: Number,
    required: [true, 'Loan duration is required'],
    min: [1, 'Duration must be at least 1 month']
  },

  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected', 'disbursed', 'repaid', 'defaulted'],
      message: 'Status must be pending, approved, rejected, disbursed, repaid, or defaulted'
    },
    default: 'pending'
  },
  appliedDate: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    default: null
  },
  approvedDate: {
    type: Date
  },
  disbursedDate: {
    type: Date
  },
  dueDate: {
    type: Date
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  amountPaid: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },
  branch: {
    type: String,
    required: false
  },
  rejectionReason: {
    type: String,
    maxlength: [300, 'Rejection reason cannot exceed 300 characters']
  }
}, {
  timestamps: true
});

// Calculate total amount with interest before saving
loanSchema.pre('save', function (next) {
  if (this.isModified('amount') || this.isModified('interestRate') || this.isModified('duration')) {
    const interest = (this.amount * this.interestRate * this.duration) / 100;
    this.totalAmount = this.amount + interest;
    this.remainingAmount = this.totalAmount - this.amountPaid;

    if (this.disbursedDate && !this.dueDate) {
      this.dueDate = new Date(this.disbursedDate.getTime() + (this.duration * 30 * 24 * 60 * 60 * 1000));
    }
  }
  next();
});

// Update user's total loans after saving
loanSchema.post('save', async function () {
  if (this.status === 'approved' || this.status === 'disbursed') {
    await this.constructor.updateUserLoans(this.member);
  }
});

// Static method to calculate user's total loans
loanSchema.statics.updateUserLoans = async function (userId) {
  const User = mongoose.model('User');
  const stats = await this.aggregate([
    {
      $match: {
        member: userId,
        status: { $in: ['approved', 'disbursed'] }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const total = stats[0] ? stats[0].total : 0;
  await User.findByIdAndUpdate(userId, { totalLoans: total });
};

module.exports = mongoose.model('Loan', loanSchema);