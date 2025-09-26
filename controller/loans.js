const Loan = require("../models/Loan");
const AuditLog = require("../models/AuditLog");
const getAllLoans = async (req, res) => {
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

    // Date range filter
    if (req.query.fromDate || req.query.toDate) {
      query.appliedDate = {};
      if (req.query.fromDate) {
        query.appliedDate.$gte = new Date(req.query.fromDate);
      }
      if (req.query.toDate) {
        query.appliedDate.$lte = new Date(req.query.toDate);
      }
    }

    const loans = await Loan.find(query)
      .populate({
        path: "member",
        select:
          "firstName lastName membershipId email branch totalContributions",
        populate: { path: "branch", select: "name code location" },
      })
      .populate("approvedBy", "firstName lastName")
      .populate("branch", "name code")
      .sort({ appliedDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Loan.countDocuments(query);

    // Calculate summary
    const summary = await Loan.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalApproved: {
            $sum: {
              $cond: [{ $eq: ["$status", "approved"] }, "$amount", 0],
            },
          },
          totalDisbursed: {
            $sum: {
              $cond: [{ $eq: ["$status", "disbursed"] }, "$amount", 0],
            },
          },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
            },
          },
        },
      },
    ]);

    // Add risk assessment to each loan with debug logs
    const loansWithRisk = loans.map((loan) => {
      let risk = null;
      // Debug log for member and loan values
      console.log("Loan ID:", loan._id);
      console.log("Loan amount:", loan.amount);
      console.log("Member:", loan.member);
      if (loan.member && loan.member.totalContributions && loan.amount) {
        console.log(
          "Member totalContributions:",
          loan.member.totalContributions
        );
        risk = Math.min(
          100,
          (loan.amount / loan.member.totalContributions) * 100
        );
        risk = Number.isFinite(risk) ? Math.round(risk * 100) / 100 : null;
        console.log("Calculated risk:", risk);
      } else {
        console.log("Risk could not be calculated for this loan.");
      }
      return {
        ...loan.toObject(),
        riskAssessment: risk,
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        loans: loansWithRisk,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        summary: summary[0] || {
          totalAmount: 0,
          totalApproved: 0,
          totalDisbursed: 0,
          pending: 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get loans",
      error: error.message,
    });
  }
};

const getSingleLoan = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate({
        path: "member",
        select:
          "firstName lastName membershipId email phone totalContributions branch",
        populate: { path: "branch", select: "name code location" },
      })
      .populate("approvedBy", "firstName lastName")
      .populate("branch", "name code location");

    if (!loan) {
      return res.status(404).json({
        status: "error",
        message: "Loan not found",
      });
    }

    // Check permissions
    if (
      req.user.role === "member" &&
      loan.member._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view your own loans.",
      });
    }

    if (
      req.user.role === "branch_lead" &&
      loan.branch._id.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view loans from your branch.",
      });
    }

    res.status(200).json({
      status: "success",
      data: { loan },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get loan",
      error: error.message,
    });
  }
};

const requestingLoan = async (req, res) => {
  try {
    // Check if member has any pending loans
    const pendingLoan = await Loan.findOne({
      member: req.user._id,
      status: { $in: ["pending", "approved"] },
    });

    if (pendingLoan) {
      return res.status(400).json({
        status: "error",
        message:
          "You already have a pending or approved loan. Please wait until it is processed or repaid.",
      });
    }

    const loanData = {
      ...req.body,
      member: req.user._id,
      branch: req.user.branch._id,
    };

    const loan = await Loan.create(loanData);
    await loan.populate({
      path: "member",
      select: "firstName lastName membershipId email branch",
      populate: { path: "branch", select: "name code location" },
    });
    await loan.populate("branch", "name code");

    // Update user's totalLoans
    const User = require("../models/User");
    const user = await User.findById(req.user._id);
    if (user) {
      // Sum all loans for this user
      const allLoans = await Loan.find({ member: user._id });
      user.totalLoans = allLoans.reduce((sum, l) => sum + (l.amount || 0), 0);
      await user.save();
    }

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "request_loan",
      resource: "loan",
      resourceId: loan._id,
      details: { amount: loan.amount },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(201).json({
      status: "success",
      message: "Loan request submitted successfully",
      data: { loan },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to request loan",
      error: error.message,
    });
  }
};
const approvingLoan = async (req, res) => {
  try {
    const { status, interestRate, rejectionReason } = req.body;

    const loan = await Loan.findById(req.params.id)
      .populate("member")
      .populate("branch");

    if (!loan) {
      return res.status(404).json({
        status: "error",
        message: "Loan not found",
      });
    }

    if (loan.status !== "pending") {
      return res.status(400).json({
        status: "error",
        message: "Loan has already been processed",
      });
    }

    // Branch lead can only approve loans from their branch
    if (
      req.user.role === "branch_lead" &&
      loan.branch._id.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only process loans from your branch.",
      });
    }

    // Update loan
    const updateData = {
      status,
      approvedBy: req.user._id,
      approvedDate: new Date(),
    };

    if (status === "approved") {
      updateData.interestRate = interestRate;
      // Calculate totalAmount using: amount + (amount * interestRate * duration / 100)
      if (loan.amount && interestRate && loan.duration) {
        updateData.totalAmount =
          loan.amount + (loan.amount * interestRate * loan.duration) / 100;
      }
    } else if (status === "rejected") {
      updateData.rejectionReason = rejectionReason;
    }

    const updatedLoan = await Loan.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate({
        path: "member",
        select: "firstName lastName membershipId email branch",
        populate: { path: "branch", select: "name code location" },
      })
      .populate("approvedBy", "firstName lastName")
      .populate("branch", "name code");

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: status === "approved" ? "approve_loan" : "reject_loan",
      resource: "loan",
      resourceId: loan._id,
      details: {
        amount: loan.amount,
        member: loan.member.email,
        reason: rejectionReason || `Interest rate: ${interestRate}%`,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: `Loan ${status} successfully`,
      data: { loan: updatedLoan },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to process loan",
      error: error.message,
    });
  }
};

const repaymentLoan = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id).populate({
      path: "member",
      select: "firstName lastName membershipId email branch",
      populate: { path: "branch", select: "name code location" },
    });

    if (!loan) {
      return res.status(404).json({
        status: "error",
        message: "Loan not found",
      });
    }

    if (loan.status !== "approved") {
      return res.status(400).json({
        status: "error",
        message: "Loan must be approved before disbursement",
      });
    }

    const updatedLoan = await Loan.findByIdAndUpdate(
      req.params.id,
      {
        status: "repaid",
        disbursedDate: new Date(),
      },
      { new: true, runValidators: true }
    )
      .populate({
        path: "member",
        select: "firstName lastName membershipId email branch",
        populate: { path: "branch", select: "name code location" },
      })
      .populate("approvedBy", "firstName lastName")
      .populate("branch", "name code");

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "disburse_loan",
      resource: "loan",
      resourceId: loan._id,
      details: {
        amount: loan.amount,
        member: loan.member.email,
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Loan disbursed successfully",
      data: { loan: updatedLoan },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to disburse loan",
      error: error.message,
    });
  }
};



module.exports = {
  getAllLoans,
  getSingleLoan,
  requestingLoan,
  approvingLoan,
  repaymentLoan,
};
