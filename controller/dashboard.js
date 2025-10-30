const Branch = require('../models/Branch');
const User = require('../models/User');
const Contribution = require('../models/Contribution');
const Loan = require('../models/Loan');
const Penalty = require('../models/Penalty');

/**
 * @swagger
 * /api/dashboard/admin:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: integer
 *         description: Number of days for recent stats (default 30)
 *     responses:
 *       200:
 *         description: Admin dashboard data
 *       500:
 *         description: Failed to get admin dashboard data
 */
const adminDashboard = async (req, res) => {
  try {
    const timeRange = req.query.range || '30'; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));

    // User statistics
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
        }
      }
    ]);

    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments({ 
      createdAt: { $gte: startDate } 
    });

    // Contribution statistics
    const contributionStats = await Contribution.aggregate([
      { $match: { status: 'confirmed' } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          recentAmount: {
            $sum: {
              $cond: [
                { $gte: ['$contributionDate', startDate] },
                '$amount',
                0
              ]
            }
          },
          recentCount: {
            $sum: {
              $cond: [
                { $gte: ['$contributionDate', startDate] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Loan statistics
    const loanStats = await Loan.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const pendingLoans = await Loan.countDocuments({ status: 'pending' });
    const recentLoans = await Loan.countDocuments({
      appliedDate: { $gte: startDate }
    });

    // Penalty statistics
    const penaltyStats = await Penalty.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Branch statistics
    const branchStats = await Branch.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'branch',
          as: 'members'
        }
      },
      {
        $project: {
          name: 1,
          code: 1,
          memberCount: { $size: '$members' },
          isActive: 1
        }
      },
      { $sort: { memberCount: -1 } }
    ]);

    // Recent activities (last 10)
    const recentActivities = await Promise.all([
      Contribution.find({ contributionDate: { $gte: startDate } })
        .populate('member', 'firstName lastName')
        .sort({ contributionDate: -1 })
        .limit(5)
        .lean(),
      Loan.find({ appliedDate: { $gte: startDate } })
        .populate('member', 'firstName lastName')
        .sort({ appliedDate: -1 })
        .limit(5)
        .lean()
    ]);

    const activities = [
      ...recentActivities[0].map(c => ({
        type: 'contribution',
        description: `${c.member.firstName} ${c.member.lastName} made a contribution of $${c.amount}`,
        date: c.contributionDate,
        amount: c.amount
      })),
      ...recentActivities[1].map(l => ({
        type: 'loan',
        description: `${l.member.firstName} ${l.member.lastName} requested a loan of $${l.amount}`,
        date: l.appliedDate,
        amount: l.amount
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    res.status(200).json({
      status: 'success',
      data: {
        users: {
          total: totalUsers,
          new: newUsers,
          byRole: userStats
        },
        contributions: contributionStats[0] || {
          totalAmount: 0,
          totalCount: 0,
          recentAmount: 0,
          recentCount: 0
        },
        loans: {
          byStatus: loanStats,
          pending: pendingLoans,
          recent: recentLoans
        },
        penalties: {
          byStatus: penaltyStats
        },
        branches: branchStats,
        recentActivities: activities
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get admin dashboard data',
      error: error.message
    });
  }
}

/**
 * @swagger
 * /api/dashboard/branch:
 *   get:
 *     summary: Get branch lead dashboard statistics
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: integer
 *         description: Number of days for recent stats (default 30)
 *     responses:
 *       200:
 *         description: Branch dashboard data
 *       500:
 *         description: Failed to get branch lead dashboard data
 */
const branchDashboard = async (req, res) => {
  try {
    const timeRange = req.query.range || '30'; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));
    const branchId = req.user.branch._id;

    // Branch member statistics
    const memberStats = await User.aggregate([
      { $match: { branch: branchId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalContributions: { $sum: '$totalContributions' },
          totalLoans: { $sum: '$totalLoans' },
          totalPenalties: { $sum: '$totalPenalties' }
        }
      }
    ]);

    // Branch contribution statistics
    const contributionStats = await Contribution.aggregate([
      { 
        $match: { 
          branch: branchId, 
          status: 'confirmed' 
        } 
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          recentAmount: {
            $sum: {
              $cond: [
                { $gte: ['$contributionDate', startDate] },
                '$amount',
                0
              ]
            }
          },
          recentCount: {
            $sum: {
              $cond: [
                { $gte: ['$contributionDate', startDate] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Branch loan statistics
    const loanStats = await Loan.aggregate([
      { $match: { branch: branchId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Branch penalty statistics
    const penaltyStats = await Penalty.aggregate([
      { $match: { branch: branchId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Top contributors in branch
    const topContributors = await User.find({ branch: branchId })
      .select('firstName lastName membershipId totalContributions')
      .sort({ totalContributions: -1 })
      .limit(10);

    // Recent branch activities
    const recentContributions = await Contribution.find({ 
      branch: branchId, 
      contributionDate: { $gte: startDate } 
    })
      .populate('member', 'firstName lastName membershipId')
      .sort({ contributionDate: -1 })
      .limit(10);

    const recentLoans = await Loan.find({ 
      branch: branchId, 
      appliedDate: { $gte: startDate } 
    })
      .populate('member', 'firstName lastName membershipId')
      .sort({ appliedDate: -1 })
      .limit(5);

    res.status(200).json({
      status: 'success',
      data: {
        branch: req.user.branch,
        members: memberStats[0] || {
          total: 0,
          active: 0,
          totalContributions: 0,
          totalLoans: 0,
          totalPenalties: 0
        },
        contributions: contributionStats[0] || {
          totalAmount: 0,
          totalCount: 0,
          recentAmount: 0,
          recentCount: 0
        },
        loans: {
          byStatus: loanStats
        },
        penalties: {
          byStatus: penaltyStats
        },
        topContributors,
        recentActivities: {
          contributions: recentContributions,
          loans: recentLoans
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get branch lead dashboard data',
      error: error.message
    });
  }
}

/**
 * @swagger
 * /api/dashboard/member:
 *   get:
 *     summary: Get member dashboard statistics
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: integer
 *         description: Number of days for recent stats (default 30)
 *     responses:
 *       200:
 *         description: Member dashboard data
 *       500:
 *         description: Failed to get member dashboard data
 */
const memberDashboard = async (req, res) => {
  try {
    const timeRange = req.query.range || '30'; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));
    const memberId = req.user._id;

    // Member's contribution history
    const contributionStats = await Contribution.aggregate([
      { $match: { member: memberId, status: 'confirmed' } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          recentAmount: {
            $sum: {
              $cond: [
                { $gte: ['$contributionDate', startDate] },
                '$amount',
                0
              ]
            }
          },
          recentCount: {
            $sum: {
              $cond: [
                { $gte: ['$contributionDate', startDate] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Member's loan status
    const loanStats = await Loan.aggregate([
      { $match: { member: memberId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const activeLoan = await Loan.findOne({ 
      member: memberId, 
      status: { $in: ['approved', 'disbursed'] } 
    }).sort({ appliedDate: -1 });

    // Member's penalty status
    const penaltyStats = await Penalty.aggregate([
      { $match: { member: memberId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Recent contributions
    const recentContributions = await Contribution.find({ 
      member: memberId,
      contributionDate: { $gte: startDate }
    })
      .populate('recordedBy', 'firstName lastName')
      .sort({ contributionDate: -1 })
      .limit(10);

    // Contribution history by month (last 12 months)
    const monthlyContributions = await Contribution.aggregate([
      { 
        $match: { 
          member: memberId, 
          status: 'confirmed',
          contributionDate: { 
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) 
          }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$contributionDate' },
            month: { $month: '$contributionDate' }
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        profile: {
          id: req.user._id,
          fullName: req.user.fullName,
          membershipId: req.user.membershipId,
          branch: req.user.branch,
          joinDate: req.user.joinDate,
          totalContributions: req.user.totalContributions,
          totalLoans: req.user.totalLoans,
          totalPenalties: req.user.totalPenalties
        },
        contributions: contributionStats[0] || {
          totalAmount: 0,
          totalCount: 0,
          recentAmount: 0,
          recentCount: 0
        },
        loans: {
          byStatus: loanStats,
          activeLoan
        },
        penalties: {
          byStatus: penaltyStats
        },
        recentContributions,
        monthlyContributions
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get member dashboard data',
      error: error.message
    });
  }
}
 
module.exports = {adminDashboard, branchDashboard, memberDashboard}