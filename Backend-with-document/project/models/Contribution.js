const mongoose = require('mongoose');

const contributionSchema = new mongoose.Schema({
  memberId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Member is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
  },
  contributionType: {
    type: String,
    enum: {
      values: ['monthly', 'weekly', 'special', 'penalty_payment'],
      message: 'Type must be monthly, weekly, special, or penalty_payment'
    },
    default: 'monthly'
  },
  contributionDate: {
    type: Date,
    default: Date.now
  },
  recordedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Recorded by is required']
  },
  branch: {
    type: String,
    required: false
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'confirmed'
  }
}, {
  timestamps: true
});

// Update user's total contributions after saving
contributionSchema.post('save', async function() {
  await this.constructor.updateUserContributions(this.memberId);
});

// Update user's total contributions after deletion
contributionSchema.post('remove', async function() {
  await this.constructor.updateUserContributions(this.memberId);
});

// Static method to calculate user's total contributions
contributionSchema.statics.updateUserContributions = async function(userId) {
  const User = mongoose.model('User');
  const stats = await this.aggregate([
    { $match: { member: userId, status: 'confirmed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const total = stats[0] ? stats[0].total : 0;
  await User.findByIdAndUpdate(userId, { totalContributions: total });
};

module.exports = mongoose.model('Contribution', contributionSchema);