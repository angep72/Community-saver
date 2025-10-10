const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Contribution = require("../models/Contribution");
const Loan = require("../models/Loan");
const Penalty = require("../models/Penalty"); // Import Penalty model

const getAllUsers = async (req, res) => {
  try {
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

const getOneUser = async (req, res) => {
  try {
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

// Endpoint to calculate user shares
const getUserShares = async (req, res) => {
  try {
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

// Get member shares and potential interest (including branch leads)
const getMemberShares = async (req, res) => {
  try {
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

    // Maps for interest calculations
    const interestEarnedMap = {};
    const interestToBeEarnedMap = {};
    contributors.forEach((c) => {
      const id = c._id.toString();
      interestEarnedMap[id] = 0;
      interestToBeEarnedMap[id] = 0;
    });

    // Helper function for contribution-based allocation
    const allocateByContribsBefore = async (amount, cutoffDate) => {
      if (!cutoffDate || amount <= 0) return {};

      const contribs = await Contribution.aggregate([
        {
          $match: {
            memberId: { $in: contributorIds },
            createdAt: { $lte: cutoffDate },
          },
        },
        { $group: { _id: "$memberId", total: { $sum: "$amount" } } },
      ]);

      const totals = {};
      let pool = 0;
      contribs.forEach((c) => {
        const id = c._id.toString();
        totals[id] = c.total;
        pool += c.total;
      });

      if (pool <= 0) return {};

      const allocations = {};
      Object.keys(totals).forEach((id) => {
        allocations[id] = (totals[id] / pool) * amount;
      });

      return allocations;
    };

    // Process repaid loans (interest already earned)
    const repaidLoans = await Loan.find({ status: "repaid" })
      .select("totalAmount amount repaidAt updatedAt createdAt")
      .lean();

    let summedInterestFromRepaidLoans = 0;
    for (const loan of repaidLoans) {
      const repaidAt = loan.repaidAt || loan.updatedAt || loan.createdAt;
      const interestAmount = (loan.totalAmount || 0) - (loan.amount || 0);
      if (!repaidAt || interestAmount <= 0) continue;

      const allocations = await allocateByContribsBefore(interestAmount, repaidAt);
      Object.entries(allocations).forEach(([id, value]) => {
        interestEarnedMap[id] = (interestEarnedMap[id] || 0) + value;
      });

      summedInterestFromRepaidLoans += interestAmount;
    }

    // Process paid penalties (additional interest earned)
    const paidPenalties = await Penalty.find({ status: "paid" })
      .select("amount paidDate updatedAt createdAt")
      .lean();

    let summedInterestFromPaidPenalties = 0;
    for (const penalty of paidPenalties) {
      const paidDate = penalty.paidDate || penalty.updatedAt || penalty.createdAt;
      const penaltyAmount = penalty.amount || 0;
      if (!paidDate || penaltyAmount <= 0) continue;

      const allocations = await allocateByContribsBefore(penaltyAmount, paidDate);
      Object.entries(allocations).forEach(([id, value]) => {
        interestEarnedMap[id] = (interestEarnedMap[id] || 0) + value;
      });

      summedInterestFromPaidPenalties += penaltyAmount;
    }

    // Process approved loans (interest to be earned)
    const approvedLoans = await Loan.find({ status: "approved" })
      .select("totalAmount amount approvedAt updatedAt createdAt")
      .lean();

    let summedInterestFromApprovedLoans = 0;
    for (const loan of approvedLoans) {
      const approvedAt = loan.approvedAt || loan.updatedAt || loan.createdAt;
      const interestAmount = (loan.totalAmount || 0) - (loan.amount || 0);
      if (!approvedAt || interestAmount <= 0) continue;

      const allocations = await allocateByContribsBefore(interestAmount, approvedAt);
      Object.entries(allocations).forEach(([id, value]) => {
        interestToBeEarnedMap[id] = (interestToBeEarnedMap[id] || 0) + value;
      });

      summedInterestFromApprovedLoans += interestAmount;
    }

    // Build response data
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
        totalInterestToBeEarned: Math.round(summedInterestFromApprovedLoans * 100) / 100,
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

module.exports = {
  getAllUsers,
  getOneUser,
  createUser,
  editUser,
  deleteUser,
  getUserShares,
  getMemberShares,
};