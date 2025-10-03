const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Contribution = require("../models/Contribution");
const Loan = require("../models/Loan");
const Penalty = require("../models/Penalty");

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

    // Get penalties status for each user
    const penaltiesStatus = await Penalty.aggregate([
      { $match: { member: { $in: userIds } } },
      {
        $group: {
          _id: "$member",
          totalPenalties: { $sum: "$amount" },
          paidPenalties: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0],
            },
          },
          pendingPenalties: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0],
            },
          },
        },
      },
    ]);

    // Create maps for quick lookup
    const contributionsMap = {};
    const penaltiesMap = {};

    contributions.forEach((c) => {
      contributionsMap[c._id.toString()] = c.total;
    });

    penaltiesStatus.forEach((p) => {
      penaltiesMap[p._id.toString()] = {
        total: p.totalPenalties,
        paid: p.paidPenalties,
        pending: p.pendingPenalties,
        isPaid: p.pendingPenalties === 0,
      };
    });

    // Attach data to users
    users.forEach((user) => {
      user.totalContributions = contributionsMap[user._id.toString()] || 0;
      user.penalties = penaltiesMap[user._id.toString()] || {
        total: 0,
        paid: 0,
        pending: 0,
        isPaid: true,
      };
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
    const user = await User.findById(req.params.id).populate("branch");

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
      totalContributions: { $gt: 0 } // Only include users with contributions
    }).populate({ path: "branch", select: "name code location" });

    // Get total contributions in the system
    const contribResult = await Contribution.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalContributions = contribResult[0] ? contribResult[0].total : 0;

    // Get total interest earned from all repaid loans
    const interestResult = await Loan.aggregate([
      { $match: { status: "repaid" } },
      {
        $group: {
          _id: null,
          total: { $sum: { $subtract: ["$totalAmount", "$amount"] } },
        },
      },
    ]);
    const totalInterest = interestResult[0] ? interestResult[0].total : 0;

    // Get total interest to be earned from all approved loans
    const approvedInterestResult = await Loan.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: null,
          total: { $sum: { $subtract: ["$totalAmount", "$amount"] } },
        },
      },
    ]);
    const totalInterestToBeEarned = approvedInterestResult[0]
      ? approvedInterestResult[0].total
      : 0;

    // Get total paid penalties using Penalty model
    const paidPenaltiesResult = await Penalty.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalPaidPenalties = paidPenaltiesResult[0]
      ? paidPenaltiesResult[0].total
      : 0;

    // Get total pending penalties
    const pendingPenaltyResult = await Penalty.aggregate([
      { $match: { status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalPendingPenalties = pendingPenaltyResult[0]
      ? pendingPenaltyResult[0].total
      : 0;

    // Add penalties to interest calculations
    const totalInterestWithPaidPenalties = totalInterest + totalPaidPenalties;
    const totalInterestToBeEarnedWithPendingPenalties =
      totalInterestToBeEarned + totalPendingPenalties;

    // Build response for each contributor (member or branch lead)
    const data = contributors.map((contributor) => {
      const share =
        totalContributions > 0
          ? contributor.totalContributions / totalContributions
          : 0;
      const interestEarned = share * totalInterestWithPaidPenalties;
      const interestToBeEarned =
        share * totalInterestToBeEarnedWithPendingPenalties;

      return {
        id: contributor._id,
        name: contributor.fullName,
        role: contributor.role === "branch_lead" ? "Branch Lead" : "Member",
        branch:
          contributor.branch && contributor.branch.name
            ? contributor.branch.name
            : contributor.branch,
        totalContribution: contributor.totalContributions,
        sharePercentage: Math.round(share * 10000) / 100, // 2 decimal places
        interestEarned: Math.round(interestEarned * 100) / 100,
        interestToBeEarned: Math.round(interestToBeEarned * 100) / 100,
      };
    });

    // Sort by total contribution descending
    data.sort((a, b) => b.totalContribution - a.totalContribution);

    res.status(200).json({
      status: "success",
      data,
      summary: {
        totalContributions,
        totalInterest: totalInterestWithPaidPenalties,
        totalInterestToBeEarned: totalInterestToBeEarnedWithPendingPenalties,
        totalPaidPenalties,
        totalPendingPenalties,
        totalContributors: data.length,
      },
    });
  } catch (error) {
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