const Contribution = require("../models/Contribution");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Loan = require("../models/Loan");
const Penalty = require("../models/Penalty"); 

const getAllContribution = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Role-based filtering
    if (req.user.role === "member") {
      query.memberId = req.user._id;
    } else if (req.user.role === "branch_lead") {
      query.branch = req.user.branch._id;
    }

    // Additional filters
    if (req.query.memberId && req.user.role !== "member") {
      query.memberId = req.query.memberId;
    }

    if (req.query.contributionType) {
      query.contributionType = req.query.contributionType;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    // Date range filter
    if (req.query.fromDate || req.query.toDate) {
      query.contributionDate = {};
      if (req.query.fromDate) {
        query.contributionDate.$gte = new Date(req.query.fromDate);
      }
      if (req.query.toDate) {
        query.contributionDate.$lte = new Date(req.query.toDate);
      }
    }

    // Find all active user IDs
    const activeUsers = await User.find({ isActive: true }).select("_id");
    const activeUserIds = activeUsers.map((u) => u._id);

    // Add filter to exclude inactive users' contributions
    query.memberId = query.memberId ? query.memberId : { $in: activeUserIds };

    const contributions = await Contribution.find(query)
      .populate({
        path: "memberId",
        select: "firstName lastName isActive",
        match: { isActive: true },
      })
      .populate("recordedBy", "firstName lastName")
      .populate("branch", "name code")
      .sort({ contributionDate: -1 })
      .skip(skip)
      .limit(limit);

    // Remove contributions where memberId is null (inactive user)
    const filteredContributions = contributions.filter((c) => c.memberId);

    const total = await Contribution.countDocuments(query);

    // Calculate totals
    const totalAmount = await Contribution.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        contributions: filteredContributions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        summary: {
          totalAmount: totalAmount[0] ? totalAmount[0].total : 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get contributions",
      error: error.message,
    });
  }
};

const getOneContribution = async (req, res) => {
  try {
    const contribution = await Contribution.findById(req.params.id)
      .populate("memberId", "firstName lastName  email phone")
      .populate("recordedBy", "firstName lastName")
      .populate("branch", "name code location");

    if (!contribution) {
      return res.status(404).json({
        status: "error",
        message: "Contribution not found",
      });
    }

    // Check permissions
    if (
      req.user.role === "member" &&
      contribution.memberId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view your own contributions.",
      });
    }

    if (
      req.user.role === "branch_lead" &&
      contribution.branch._id.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message:
          "Access denied. You can only view contributions from your branch.",
      });
    }

    res.status(200).json({
      status: "success",
      data: { contribution },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get contribution",
      error: error.message,
    });
  }
};

const createContribution = async (req, res) => {
  try {
    // Verify member exists and belongs to the right branch
    const member = await User.findById(req.body.memberId);
    if (!member) {
      return res.status(404).json({
        status: "error",
        message: "Member not found",
      });
    }

    // Branch lead can only add contributions for their branch members
    // Branch lead can only add contributions for their branch members

    const contributionData = {
      ...req.body,
      recordedBy: req.user._id,
      branch:
        req.user.role === "branch_lead" ? req.user.branch._id : member.branch,
    };

    const contribution = await Contribution.create(contributionData);
    await contribution.populate("memberId", "firstName lastName ");
    await contribution.populate("recordedBy", "firstName lastName");
    await contribution.populate("branch", "name code");

    // --- Penalty logic: assign penalty if contributed after 10th ---
    const contributionDate = new Date(contribution.contributionDate);
    if (contributionDate.getDate() > 10) {
      // Get member name
      let memberName = "";
      if (contribution.memberId.firstName && contribution.memberId.lastName) {
        memberName = `${contribution.memberId.firstName} ${contribution.memberId.lastName}`;
      } else {
        // fallback: fetch user
        const memberDoc = await User.findById(
          contribution.memberId._id || contribution.memberId
        );
        if (memberDoc)
          memberName = `${memberDoc.firstName} ${memberDoc.lastName}`;
      }
      await Penalty.create({
        member: contribution.memberId._id || contribution.memberId,
        amount: 25,
        reason: "late_contribution",
        description: `Late contribution for ${memberName} in ${contributionDate.toLocaleString(
          "default",
          { month: "long" }
        )} (${contributionDate.toISOString().slice(0, 10)})`,
        assignedBy: req.user._id,
        status: "pending",
        assignedDate: contributionDate,
        branch: contribution.branch,
      });
    }

    // Update user's totalContributions after adding a contribution
    const allContributions = await Contribution.find({ memberId: member._id });
    member.totalContributions = allContributions.reduce(
      (sum, c) => sum + (c.amount || 0),
      0
    );
    await member.save();

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "add_contribution",
      resource: "contribution",
      resourceId: contribution._id,
      details: { amount: contribution.amount, member: member.email },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(201).json({
      status: "success",
      message: "Contribution added successfully",
      data: { contribution },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to add contribution",
      error: error.message,
    });
  }
};

const updatingContribution = async (req, res) => {
  try {
    const contribution = await Contribution.findById(req.params.id).populate(
      "branch"
    );

    if (!contribution) {
      return res.status(404).json({
        status: "error",
        message: "Contribution not found",
      });
    }

    // Branch lead can only update contributions from their branch
    if (
      req.user.role === "branch_lead" &&
      contribution.branch._id.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message:
          "Access denied. You can only update contributions from your branch.",
      });
    }

    // Don't allow changing member or branch
    delete req.body.member;
    delete req.body.branch;

    const updatedContribution = await Contribution.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate("memberId", "firstName lastName")
      .populate("recordedBy", "firstName lastName")
      .populate("branch", "name code");

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "update_contribution",
      resource: "contribution",
      resourceId: contribution._id,
      details: req.body,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Contribution updated successfully",
      data: { contribution: updatedContribution },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to update contribution",
      error: error.message,
    });
  }
};
const deletingContribution = async (req, res) => {
  try {
    const contribution = await Contribution.findByIdAndDelete(req.params.id);

    if (!contribution) {
      return res.status(404).json({
        status: "error",
        message: "Contribution not found",
      });
    }

    // Update user's total contributions
    await Contribution.updateUserContributions(contribution.memberId);

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "delete_contribution",
      resource: "contribution",
      resourceId: contribution._id,
      details: { amount: contribution.amount },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Contribution deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to delete contribution",
      error: error.message,
    });
  }
};

const getTotalContributions = async (req, res) => {
  try {
    const result = await Contribution.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const total = result[0] ? result[0].total : 0;
    res.status(200).json({
      status: "success",
      data: { totalContributions: total },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to calculate total contributions",
      error: error.message,
    });
  }
};

// Get the sum of all contributions minus total approved loans
const getNetContributions = async (req, res) => {
  try {
    // Only include contributions from active users (memberId not null)
    const activeUsers = await User.find({ isActive: true }).select("_id");
    const activeUserIds = activeUsers.map((u) => u._id);

    // Sum all contributions from active users only
    const contribResult = await Contribution.aggregate([
      { $match: { memberId: { $in: activeUserIds } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalContributions = contribResult[0] ? contribResult[0].total : 0;

    // Sum all approved loans with non-null member
    const approvedLoans = await Loan.find({ status: "approved" }).populate("member");
    const totalApprovedLoans = approvedLoans
      .filter(l => l.member !== null)
      .reduce((sum, l) => sum + (l.amount || 0), 0);

    // Sum all interest from repaid loans with non-null member
    const repaidLoans = await Loan.find({ status: "repaid" }).populate("member");
    const totalInterestFromRepaidLoans = repaidLoans
      .filter(l => l.member !== null)
      .reduce((sum, l) => sum + ((l.totalAmount || 0) - (l.amount || 0)), 0);

    // Sum all collected penalties with non-null member
    const collectedPenalties = await Penalty.find({ status: "collected" }).populate("member");
    const totalCollectedPenalties = collectedPenalties
      .filter(p => p.member !== null)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Sum all paid penalties with non-null member
    const paidPenalties = await Penalty.find({ status: "paid" }).populate("member");
    const totalPaidPenalties = paidPenalties
      .filter(p => p.member !== null)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Sum all pending penalties with non-null member
    const pendingPenalties = await Penalty.find({ status: "pending" }).populate("member");
    const totalPendingPenalties = pendingPenalties
      .filter(p => p.member !== null)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Net available: contributions - approved loans + interest from repaid loans + collected penalties + paid penalties
    const netAvailable =
      totalContributions -
      totalApprovedLoans +
      totalInterestFromRepaidLoans +
      totalCollectedPenalties +
      totalPaidPenalties;

    // Sum all interest from approved loans with non-null member
    const approvedLoansForInterest = await Loan.find({ status: "approved" }).populate("member");
    const totalInterestFromApprovedLoans = approvedLoansForInterest
      .filter(l => l.member !== null)
      .reduce((sum, l) => sum + ((l.totalAmount || 0) - (l.amount || 0)), 0);

    // Future balance: netAvailable + interest from approved loans + pending penalties
    const futureBalance =
      netAvailable + totalInterestFromApprovedLoans + totalPendingPenalties;

    // Total amount to be repaid for approved loans with non-null member
    const totalToBeRepaidOnApprovedLoans = approvedLoansForInterest
      .filter(l => l.member !== null)
      .reduce((sum, l) => sum + (l.totalAmount || 0), 0);

    // Best future balance: netAvailable + total to be repaid on approved loans + pending penalties
    const bestFutureBalance =
      netAvailable + totalToBeRepaidOnApprovedLoans + totalPendingPenalties;

    res.status(200).json({
      status: "success",
      data: {
        totalContributions,
        totalApprovedLoans,
        totalInterestFromRepaidLoans,
        totalCollectedPenalties,
        totalPaidPenalties,
        totalPendingPenalties,
        netAvailable,
        futureBalance,
        totalToBeRepaidOnApprovedLoans,
        bestFutureBalance,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to calculate net contributions",
      error: error.message,
    });
  }
};

module.exports = {
  getAllContribution,
  getOneContribution,
  createContribution,
  updatingContribution,
  deletingContribution,
  getTotalContributions,
  getNetContributions,
};
