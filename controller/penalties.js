const Penalty = require("../models/Penalty");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Contribution = require("../models/Contribution");

const getAllPenalties = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Role-based filtering
    if (req.user.role === "member") {
      query.member = req.user._id;
    } else if (req.user.role === "branch_lead") {
      query.branch = req.user.branch._id;
    }

    // Additional filters
    if (req.query.member && req.user.role !== "member") {
      query.member = req.query.member;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.reason) {
      query.reason = req.query.reason;
    }

    // Date range filter
    if (req.query.fromDate || req.query.toDate) {
      query.assignedDate = {};
      if (req.query.fromDate) {
        query.assignedDate.$gte = new Date(req.query.fromDate);
      }
      if (req.query.toDate) {
        query.assignedDate.$lte = new Date(req.query.toDate);
      }
    }

    const penalties = await Penalty.find(query)
      .populate("member", "firstName lastName membershipId")
      .populate("assignedBy", "firstName lastName")
      .populate("waivedBy", "firstName lastName")
      .populate("branch", "name code")
      .sort({ assignedDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Penalty.countDocuments(query);

    // Calculate summary
    const summary = await Penalty.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0],
            },
          },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0],
            },
          },
          waivedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "waived"] }, "$amount", 0],
            },
          },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        penalties,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        summary: summary[0] || {
          totalAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          waivedAmount: 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get penalties",
      error: error.message,
    });
  }
};
const getSinglePenalty = async (req, res) => {
  try {
    const penalty = await Penalty.findById(req.params.id)
      .populate("member", "firstName lastName membershipId email ")
      .populate("assignedBy", "firstName lastName")
      .populate("waivedBy", "firstName lastName")
      .populate("branch", "name code location");

    if (!penalty) {
      return res.status(404).json({
        status: "error",
        message: "Penalty not found",
      });
    }

    // Check permissions
    if (
      req.user.role === "member" &&
      penalty.member._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view your own penalties.",
      });
    }

    if (
      req.user.role === "branch_lead" &&
      penalty.branch._id.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view penalties from your branch.",
      });
    }

    res.status(200).json({
      status: "success",
      data: { penalty },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get penalty",
      error: error.message,
    });
  }
};

const createPenality = async (req, res) => {
  try {
    // Verify member exists and belongs to the right branch
    const member = await User.findById(req.body.member);
    if (!member) {
      return res.status(404).json({
        status: "error",
        message: "Member not found",
      });
    }

    // Branch lead can only assign penalties to their branch members
    if (
      req.user.role === "branch_lead" &&
      member.branch.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message:
          "Access denied. You can only assign penalties to your branch members.",
      });
    }

    const penaltyData = {
      ...req.body,
      assignedBy: req.user._id,
      branch:
        req.user.role === "branch_lead" ? req.user.branch._id : member.branch,
    };

    const penalty = await Penalty.create(penaltyData);
    await penalty.populate("member", "firstName lastName membershipId");
    await penalty.populate("assignedBy", "firstName lastName");
    await penalty.populate("branch", "name code");

    // Log the actions
    await AuditLog.create({
      user: req.user._id,
      action: "assign_penalty",
      resource: "penalty",
      resourceId: penalty._id,
      details: {
        amount: penalty.amount,
        reason: penalty.reason,
        member: member.email,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(201).json({
      status: "success",
      message: "Penalty assigned successfully",
      data: { penalty },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to assign penalty",
      error: error.message,
    });
  }
};

const payPenalty = async (req, res) => {
  try {
    const penalty = await Penalty.findById(req.params.id)
      .populate("member")
      .populate("branch");

    if (!penalty) {
      return res.status(404).json({
        status: "error",
        message: "Penalty not found",
      });
    }

    if (penalty.status !== "pending") {
      return res.status(400).json({
        status: "error",
        message: "Penalty is not pending",
      });
    }

    // Branch lead can only mark penalties from their branch as paid
    if (
      req.user.role === "branch_lead" &&
      penalty.branch._id.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message:
          "Access denied. You can only process penalties from your branch.",
      });
    }

    const updatedPenalty = await Penalty.findByIdAndUpdate(
      req.params.id,
      {
        status: "paid",
        paidDate: new Date(),
      },
      { new: true, runValidators: true }
    )
      .populate("member", "firstName lastName membershipId")
      .populate("assignedBy", "firstName lastName")
      .populate("branch", "name code");

    // Create a negative penalty contribution
    await Contribution.create({
      memberId: penalty.member._id,
      amount: -25,
      type: "penalty",
      contributionDate: new Date(),
      branch: penalty.branch._id,
      recordedBy: req.user._id,
    });

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "pay_penalty",
      resource: "penalty",
      resourceId: penalty._id,
      details: {
        amount: penalty.amount,
        member: penalty.member.email,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Penalty marked as paid",
      data: { penalty: updatedPenalty },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to process penalty payment",
      error: error.message,
    });
  }
};
// Get total penalties collected
const getTotalPenaltiesCollected = async (req, res) => {
  try {
    // Only count penalties with status 'paid'
    const result = await Penalty.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, totalCollected: { $sum: "$amount" } } },
    ]);
    const totalCollected = result[0] ? result[0].totalCollected : 0;
    res.status(200).json({
      status: "success",
      totalPenaltiesCollected: totalCollected,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get total penalties collected",
      error: error.message,
    });
  }
};

const waivePenalty = async (req, res) => {
  try {
    const penalty = await Penalty.findById(req.params.id).populate("member");

    if (!penalty) {
      return res.status(404).json({
        status: "error",
        message: "Penalty not found",
      });
    }

    if (penalty.status !== "pending") {
      return res.status(400).json({
        status: "error",
        message: "Penalty is not pending",
      });
    }

    const updatedPenalty = await Penalty.findByIdAndUpdate(
      req.params.id,
      {
        status: "waived",
        waivedDate: new Date(),
        waivedBy: req.user._id,
      },
      { new: true, runValidators: true }
    )
      .populate("member", "firstName lastName membershipId")
      .populate("assignedBy", "firstName lastName")
      .populate("waivedBy", "firstName lastName")
      .populate("branch", "name code");

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "waive_penalty",
      resource: "penalty",
      resourceId: penalty._id,
      details: {
        amount: penalty.amount,
        member: penalty.member.email,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Penalty waived successfully",
      data: { penalty: updatedPenalty },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to waive penalty",
      error: error.message,
    });
  }
};
module.exports = {
  getAllPenalties,
  getSinglePenalty,
  createPenality,
  payPenalty,
  waivePenalty,
  getTotalPenaltiesCollected,
};
