const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Contribution = require("../models/Contribution");
const Loan = require("../models/Loan");
const Penalty = require("../models/Penalty"); // Import Penalty model

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users with pagination and filters
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of users per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by user role
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of users
 *       500:
 *         description: Failed to get users
 */
const getAllUsers = async (req, res) => {
  try {
    // Add caching headers for read-only endpoint
    res.set("Cache-Control", "public, max-age=30");

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Add filters
    if (req.query.role) {
      query.role = req.query.role;
    }

    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    } else {
      query.isActive = true; // Default: only active users
    }

    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: "i" } },
        { lastName: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
      ];
    }

    // Fetch users as plain objects
    const users = await User.find(query)
      .populate("branch")
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get all user IDs
    const userIds = users.map((u) => u._id);

    // Get contributions data
    const contributions = await Contribution.aggregate([
      { $match: { memberId: { $in: userIds } } },
      { $group: { _id: "$memberId", total: { $sum: "$amount" } } },
    ]);

    // Create map for quick lookup
    const contributionsMap = {};
    contributions.forEach((c) => {
      contributionsMap[c._id.toString()] = c.total;
    });

    // Attach contributions data to users
    users.forEach((user) => {
      user.totalContributions = contributionsMap[user._id.toString()] || 0;
    });

    const total = await User.countDocuments(query);

    res.status(200).json({
      status: "success",
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get users",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get a single user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to get user
 */
const getOneUser = async (req, res) => {
  try {
    // Add caching headers for read-only endpoint
    res.set("Cache-Control", "public, max-age=30");

    const user = await User.findById(req.params.id).populate("branch").lean();

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Check permissions
    if (
      req.user.role === "member" &&
      req.user._id.toString() !== req.params.id
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view your own profile.",
      });
    }

    if (req.user.role === "branch_lead") {
      if (
        user.branch._id.toString() !== req.user.branch._id.toString() &&
        req.user._id.toString() !== req.params.id
      ) {
        return res.status(403).json({
          status: "error",
          message: "Access denied. You can only view users from your branch.",
        });
      }
    }

    res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get user",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *               branch:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: User with this email already exists
 *       500:
 *         description: Failed to create user
 */
const createUser = async (req, res) => {
  try {
    const user = await User.create(req.body);

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "create_user",
      resource: "user",
      resourceId: user._id,
      details: { email: user.email, role: user.role },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(201).json({
      status: "success",
      message: "User created successfully",
      data: { user },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: "error",
        message: "User with this email already exist",
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create user",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Edit a user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User updated successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to update user
 */
const editUser = async (req, res) => {
  try {
    // Check permissions
    if (
      req.user.role === "member" &&
      req.user._id.toString() !== req.params.id
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only update your own profile.",
      });
    }

    // Members cannot change their role or branch
    if (req.user.role === "member") {
      delete req.body.role;
      delete req.body.branch;
      delete req.body.isActive;
    }

    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("branch");

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "update_user",
      resource: "user",
      resourceId: user._id,
      details: req.body,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to update user",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       400:
 *         description: Cannot delete user due to active loans or contributions
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to delete user
 */
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Check if user has any loans that are not repaid (pending or approved)
    const activeLoans = await Loan.findOne({
      memberId: req.params.id,
      status: { $in: ["pending", "approved"] },
    });

    if (activeLoans) {
      return res.status(400).json({
        status: "error",
        message:
          "Cannot delete user. User has active loans (pending or approved) in the system.",
      });
    }

    // Check if user has total contributions greater than zero
    const contributionResult = await Contribution.aggregate([
      { $match: { memberId: user._id } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalContributions = contributionResult[0]
      ? contributionResult[0].total
      : 0;

    if (totalContributions > 0) {
      return res.status(400).json({
        status: "error",
        message:
          "Cannot delete user. User has contributions greater than zero.",
      });
    }

    // Log the action before deletion
    await AuditLog.create({
      user: req.user._id,
      action: "delete_user",
      resource: "user",
      resourceId: user._id,
      details: { email: user.email },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Permanently delete the user
    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: "success",
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to delete user",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/users/shares:
 *   get:
 *     summary: Get user shares (percentage of total contributions)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: User shares data
 *       500:
 *         description: Failed to calculate user shares
 */
const getUserShares = async (req, res) => {
  try {
    // Add caching headers for read-only endpoint with computed data
    res.set("Cache-Control", "public, max-age=30");

    // Get all active members with their branch and totalContributions
    const users = await User.find({ role: "member", isActive: true })
      .populate("branch", "name code")
      .select("firstName lastName branch totalContributions");

    // Calculate total savings of all members
    const totalSavings = users.reduce(
      (sum, user) => sum + (user.totalContributions || 0),
      0
    );

    // Prepare shares data
    const shares = users.map((user) => ({
      name: `${user.firstName} ${user.lastName}`,
      branch: user.branch && user.branch.name ? user.branch.name : user.branch,
      totalContributions: user.totalContributions || 0,
      percentage:
        totalSavings > 0
          ? (((user.totalContributions || 0) / totalSavings) * 100).toFixed(2)
          : "0.00",
    }));

    res.status(200).json({
      status: "success",
      totalSavings,
      shares,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to calculate user shares",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/users/member-shares:
 *   get:
 *     summary: Get member shares and interest (including branch leads)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Member shares and interest data
 *       500:
 *         description: Failed to calculate member shares
 */
const getMemberShares = async (req, res) => {
  try {
    // Add caching headers for read-only endpoint with heavy computations
    res.set("Cache-Control", "public, max-age=30");

    // Get all active members AND branch leads who have contributions
    const contributors = await User.find({
      role: { $in: ["member", "branch_lead"] },
      isActive: true,
      totalContributions: { $gt: 0 },
    })
      .populate({ path: "branch", select: "name code location" })
      .lean();

    const contributorIds = contributors.map((c) => c._id);

    // Get total contributions
    const contribResult = await Contribution.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalContributions = contribResult[0]?.total || 0;

    // ============================================
    // OPTIMIZATION: Fetch ALL contributions ONCE with timestamps
    // ============================================
    const allContributions = await Contribution.find({
      memberId: { $in: contributorIds }
    })
      .select('memberId amount createdAt')
      .sort({ createdAt: 1 })
      .lean();

    // Create a sorted array for efficient lookups
    const sortedContributions = allContributions.map(c => ({
      memberId: c.memberId.toString(),
      amount: c.amount,
      createdAt: c.createdAt
    }));

    // Maps for interest calculations
    const interestEarnedMap = {};
    const interestToBeEarnedMap = {};
    contributors.forEach((c) => {
      const id = c._id.toString();
      interestEarnedMap[id] = 0;
      interestToBeEarnedMap[id] = 0;
    });

    // ============================================
    // OPTIMIZED: Helper function using cached data
    // ============================================
    const allocateByContribsBeforeOptimized = (amount, cutoffDate) => {
      if (!cutoffDate || amount <= 0) return {};

      // Calculate totals from cached contributions
      const totals = {};
      let pool = 0;

      sortedContributions.forEach(contrib => {
        if (contrib.createdAt <= cutoffDate) {
          const id = contrib.memberId;
          totals[id] = (totals[id] || 0) + contrib.amount;
          pool += contrib.amount;
        }
      });

      if (pool <= 0) return {};

      // Calculate allocations
      const allocations = {};
      Object.keys(totals).forEach((id) => {
        allocations[id] = (totals[id] / pool) * amount;
      });

      return allocations;
    };

    // ============================================
    // Fetch all loans and penalties in parallel
    // ============================================
    const [repaidLoans, paidPenalties, approvedLoans, pendingPenalties] = await Promise.all([
      Loan.find({ status: "repaid" })
        .select("totalAmount amount repaidAt updatedAt createdAt")
        .lean(),

      Penalty.find({ status: "paid" })
        .select("amount paidDate updatedAt createdAt member")
        .populate("member", "_id")
        .lean(),

      Loan.find({ status: "approved" })
        .select("totalAmount amount")
        .lean(),

      Penalty.find({ status: { $ne: "paid" } })
        .select("amount member")
        .populate("member", "_id")
        .lean()
    ]);

    // ============================================
    // Process repaid loans (interest already earned)
    // ============================================
    let summedInterestFromRepaidLoans = 0;
    for (const loan of repaidLoans) {
      const repaidAt = loan.repaidAt || loan.updatedAt || loan.createdAt;
      const interestAmount = (loan.totalAmount || 0) - (loan.amount || 0);
      if (!repaidAt || interestAmount <= 0) continue;

      // Use optimized function with cached data
      const allocations = allocateByContribsBeforeOptimized(interestAmount, repaidAt);
      Object.entries(allocations).forEach(([id, value]) => {
        interestEarnedMap[id] = (interestEarnedMap[id] || 0) + value;
      });

      summedInterestFromRepaidLoans += interestAmount;
    }

    // ============================================
    // Process paid penalties (additional interest earned)
    // ============================================
    let summedInterestFromPaidPenalties = 0;
    for (const penalty of paidPenalties) {
      if (!penalty.member) continue;
      const paidDate = penalty.paidDate || penalty.updatedAt || penalty.createdAt;
      const penaltyAmount = penalty.amount || 0;
      if (!paidDate || penaltyAmount <= 0) continue;

      // Use optimized function with cached data
      const allocations = allocateByContribsBeforeOptimized(penaltyAmount, paidDate);
      Object.entries(allocations).forEach(([id, value]) => {
        interestEarnedMap[id] = (interestEarnedMap[id] || 0) + value;
      });

      summedInterestFromPaidPenalties += penaltyAmount;
    }

    // ============================================
    // Process approved loans and pending penalties (interest to be earned)
    // ============================================
    let summedInterestFromApprovedLoans = 0;
    for (const loan of approvedLoans) {
      const interestAmount = (loan.totalAmount || 0) - (loan.amount || 0);
      if (interestAmount > 0) {
        summedInterestFromApprovedLoans += interestAmount;
      }
    }

    // Only use pending penalties where member is not null
    const summedPendingPenalties = pendingPenalties.reduce((sum, penalty) =>
      penalty.member ? sum + (penalty.amount || 0) : sum, 0);

    // Total pending interest includes both loan interest and pending penalties
    const totalPendingInterest = summedInterestFromApprovedLoans + summedPendingPenalties;

    // Distribute the total pending interest based on contribution shares
    contributors.forEach(contributor => {
      const id = contributor._id.toString();
      const sharePercentage = totalContributions > 0
        ? (contributor.totalContributions || 0) / totalContributions
        : 0;
      interestToBeEarnedMap[id] = totalPendingInterest * sharePercentage;
    });

    // ============================================
    // Build response data
    // ============================================
    const data = contributors.map((contributor) => {
      const id = contributor._id.toString();
      const share = totalContributions > 0
        ? (contributor.totalContributions || 0) / totalContributions
        : 0;

      return {
        id: contributor._id,
        name: contributor.fullName || `${contributor.firstName} ${contributor.lastName}`,
        role: contributor.role === "branch_lead" ? "Branch Lead" : "Member",
        branch: contributor.branch?.name || contributor.branch || "Unknown",
        totalContribution: contributor.totalContributions || 0,
        sharePercentage: Math.round(share * 10000) / 100,
        interestEarned: Math.round((interestEarnedMap[id] || 0) * 100) / 100,
        interestToBeEarned: Math.round((interestToBeEarnedMap[id] || 0) * 100) / 100,
      };
    });

    // Sort by total contribution descending
    data.sort((a, b) => b.totalContribution - a.totalContribution);

    res.status(200).json({
      status: "success",
      data,
      summary: {
        totalContributions,
        totalInterest: Math.round((summedInterestFromRepaidLoans + summedInterestFromPaidPenalties) * 100) / 100,
        totalInterestToBeEarned: Math.round(totalPendingInterest * 100) / 100,
        totalContributors: data.length,
        totalPenaltyInterest: Math.round(summedInterestFromPaidPenalties * 100) / 100,
      },
    });
  } catch (error) {
    console.error("getMemberShares error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to calculate member shares",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/users/{id}/report:
 *   get:
 *     summary: Get a detailed report for a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User report data
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to generate user report
 */
const getUserReport = async (req, res) => {
  try {
    const userId = req.params.id;

    // Get user details
    const user = await User.findById(userId)
      .populate('branch', 'name code location')
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get contributions
    const contributions = await Contribution.find({ memberId: userId })
      .sort({ createdAt: -1 })
      .lean();

    const totalContributions = contributions.reduce((sum, contrib) => sum + contrib.amount, 0);

    // Get loans
    const loans = await Loan.find({ memberId: userId })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate loan statistics
    const loanStats = {
      totalLoansCount: loans.length,
      activeLoans: loans.filter(loan => ['pending', 'approved'].includes(loan.status)),
      repaidLoans: loans.filter(loan => loan.status === 'repaid'),
      totalBorrowed: loans.reduce((sum, loan) => sum + (loan.amount || 0), 0),
      totalRepaid: loans.reduce((sum, loan) => sum + (loan.totalAmount || 0), 0),
    };

    // Get penalties
    const penalties = await Penalty.find({ memberId: userId })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate penalty statistics
    const penaltyStats = {
      totalPenalties: penalties.length,
      unpaidPenalties: penalties.filter(penalty => penalty.status !== 'paid'),
      totalPenaltyAmount: penalties.reduce((sum, penalty) => sum + penalty.amount, 0),
      paidPenaltyAmount: penalties
        .filter(penalty => penalty.status === 'paid')
        .reduce((sum, penalty) => sum + penalty.amount, 0),
    };

    // Calculate shares and interest
    const { interestEarned, interestToBeEarned } = await calculateUserInterest(userId);

    const report = {
      userDetails: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        role: user.role,
        branch: user.branch,
        membershipDate: user.createdAt,
        isActive: user.isActive,
      },
      contributionSummary: {
        totalContributions,
        contributionCount: contributions.length,
        lastContribution: contributions[0],
        allContributions: contributions,
      },
      loanSummary: {
        ...loanStats,
        activeLoansDetails: loanStats.activeLoans,
        recentLoans: loans.slice(0, 5), // Last 5 loans
      },
      penaltySummary: {
        ...penaltyStats,
        recentPenalties: penalties.slice(0, 5), // Last 5 penalties
      },
      investmentSummary: {
        totalInterestEarned: interestEarned,
        pendingInterest: interestToBeEarned,
        sharePercentage: totalContributions > 0
          ? ((totalContributions / await getTotalContributions()) * 100).toFixed(2)
          : '0.00',
      }
    };

    res.status(200).json({
      status: 'success',
      data: report
    });

  } catch (error) {
    console.error('getUserReport error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate user report',
      error: error.message
    });
  }
};

// Helper functions
async function calculateUserInterest(userId) {
  // Reuse logic from getMemberShares but for single user
  // ... implementation details ...
  return { interestEarned: 0, interestToBeEarned: 0 }; // Implement actual calculation
}

async function getTotalContributions() {
  const result = await Contribution.aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return result[0]?.total || 0;
}

module.exports = {
  getAllUsers,
  getOneUser,
  createUser,
  editUser,
  deleteUser,
  getUserShares,
  getMemberShares,
  getUserReport,
};