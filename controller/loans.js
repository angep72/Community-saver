const Loan = require("../models/Loan");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const sgMail = require("@sendgrid/mail");
const fs = require("fs");
const path = require("path");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * @swagger
 * /api/loans:
 *   get:
 *     summary: Get all loans with filters and risk assessment
 *     tags: [Loans]
 *     parameters:
 *       - in: query
 *         name: member
 *         schema:
 *           type: string
 *         description: Filter by member ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by loan status
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter loans applied after this date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter loans applied before this date
 *     responses:
 *       200:
 *         description: List of loans and summary
 *       500:
 *         description: Failed to get loans
 */
const getAllLoans = async (req, res) => {
  try {
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

    // Fetch all matching loans (no pagination)
    const loans = await Loan.find(query)
      .populate({
        path: "member",
        select:
          "firstName lastName membershipId email branch totalContributions",
        populate: { path: "branch", select: "name code location" },
      })
      .populate("approvedBy", "firstName lastName")
      .populate("branch", "name code")
      .sort({ appliedDate: -1 });

    // Exclude loans with null member (e.g., deleted users)
    const filteredLoans = loans.filter(loan => loan.member !== null);

    // total is number of returned loans
    const total = filteredLoans.length;

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

    // Add risk assessment to each loan
    const loansWithRisk = filteredLoans.map((loan) => {
      let risk = null;
      if (loan.member && loan.member.totalContributions && loan.amount) {
        risk = Math.min(
          100,
          (loan.amount / loan.member.totalContributions) * 100
        );
        risk = Number.isFinite(risk) ? Math.round(risk * 100) / 100 : null;
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
        total,
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

/**
 * @swagger
 * /api/loans/{id}:
 *   get:
 *     summary: Get a single loan by ID
 *     tags: [Loans]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Loan ID
 *     responses:
 *       200:
 *         description: Loan details
 *       404:
 *         description: Loan not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to get loan
 */
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

/**
 * @swagger
 * /api/loans/request:
 *   post:
 *     summary: Request a new loan
 *     tags: [Loans]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               duration:
 *                 type: number
 *               purpose:
 *                 type: string
 *     responses:
 *       201:
 *         description: Loan request submitted successfully
 *       400:
 *         description: Already has a pending or approved loan
 *       500:
 *         description: Failed to request loan
 */
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

/**
 * @swagger
 * /api/loans/{id}/approve:
 *   put:
 *     summary: Approve or reject a loan
 *     tags: [Loans]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Loan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               interestRate:
 *                 type: number
 *               rejectionReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Loan approved or rejected successfully
 *       404:
 *         description: Loan not found
 *       400:
 *         description: Loan already processed
 *       500:
 *         description: Failed to process loan
 */
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

/**
 * @swagger
 * /api/loans/{id}/repay:
 *   put:
 *     summary: Mark a loan as repaid/disbursed
 *     tags: [Loans]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Loan ID
 *     responses:
 *       200:
 *         description: Loan disbursed successfully
 *       404:
 *         description: Loan not found
 *       400:
 *         description: Loan must be approved before disbursement
 *       500:
 *         description: Failed to disburse loan
 */
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

/**
 * @swagger
 * /api/loans/{id}/send-approval-email:
 *   post:
 *     summary: Send loan approval email
 *     tags: [Loans]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Loan ID
 *     responses:
 *       200:
 *         description: Loan approval email sent
 *       404:
 *         description: Loan not found
 *       400:
 *         description: Loan is not approved or email sending failed
 *       500:
 *         description: Failed to send email
 */
const sendLoanApprovalEmail = async (req, res) => {
  try {
    const loanId = req.params.id;
    const loan = await Loan.findById(loanId)
      .populate({
        path: "member",
        select: "firstName lastName email membershipId",
      })
      .populate("branch", "name code group"); // include 'group' field

    if (!loan) {
      return res.status(404).json({ status: "error", message: "Loan not found" });
    }

    if (loan.status !== "approved") {
      return res.status(400).json({ status: "error", message: "Loan is not approved" });
    }

    const member = loan.member;
    if (!member || !member.email) {
      return res.status(400).json({ status: "error", message: "Member email not available" });
    }

    const fullName = `${member.firstName || ""} ${member.lastName || ""}`.trim() || "Member";
    const loanAmount = loan.amount || 0;
    const interest = loan.interestRate || 0;
    const duration = loan.duration || 0;
    const totalAmount = loan.totalAmount || loanAmount;
    const approvedDate = new Date(loan.approvedDate || Date.now()).toLocaleString();

    // Prefer branch.group, fallback to branch.name
    const groupName = loan.branch?.group || loan.branch?.name || "N/A";

    // Log group and user info
    console.info("Sending loan approval email - context:", {
      loanId: loan._id?.toString?.() || loan._id,
      groupName,
      member: {
        id: member._id?.toString?.() || member._id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        membershipId: member.membershipId,
      },
      loan: {
        amount: loanAmount,
        interest,
        duration,
        totalAmount,
      },
      approvedDate,
    });

    // Attachment: loan agreement PDF (optional)
    let attachments = [];
    try {
      const pdfPath = path.join(__dirname, "..", "resources", "loan_agreement.pdf");
      if (fs.existsSync(pdfPath)) {
        const pdfBuffer = fs.readFileSync(pdfPath);
        attachments.push({
          content: pdfBuffer.toString("base64"),
          filename: "loan_agreement.pdf",
          type: "application/pdf",
          disposition: "attachment",
        });
        console.info("Attached loan agreement PDF:", pdfPath);
      } else {
        console.warn("Loan agreement PDF not found at:", pdfPath);
      }
    } catch (attachErr) {
      console.warn("Error reading loan agreement PDF:", attachErr);
    }

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 600px; margin: auto;">
        <h2 style="color: #0f766e; margin-bottom: 0.5rem;">Your Loan Has Been Approved</h2>
        <p>Hello ${fullName},</p>
        <p style="color:#374151;">
          Good news — your loan application has been <strong style="color:#065f46;">approved</strong>. Below are the details:
        </p>

        <table style="width:100%; border-collapse: collapse; margin-top: 12px;">
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb; font-weight:600;">Loan Amount</td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${loanAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb; font-weight:600;">Interest Rate (%)</td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${interest}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb; font-weight:600;">Duration (months)</td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${duration}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb; font-weight:600;">Total Amount to Repay</td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${totalAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb; font-weight:600;">Approved Date</td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${approvedDate}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb; font-weight:600;">Group</td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${groupName}</td>
          </tr>
        </table>

        <p style="margin-top: 16px; color:#374151;">
          Please fill and sign the attached loan agreement PDF, then send the signed copy back to this email address as a scanned PDF or clear photo. Once we receive the signed agreement we will proceed with disbursement.
        </p>

        <p style="margin-top: 16px; color:#374151;">
          If you have questions about repayment schedules or need assistance, reply to this email or contact your branch lead.
        </p>

        <p style="margin-top: 20px;">
          Regards,<br/>
          <strong>Community Saver Team</strong>
        </p>

        <hr style="border:none; border-top:1px solid #e6eef0; margin-top:20px;" />
        <small style="color:#9ca3af;">This is an autogenerated message — do not reply directly.</small>
      </div>
    `;

    const msg = {
      to: member.email,
      from: process.env.SENDGRID_VERIFIED_SENDER,
      subject: "Loan Approved — Community Saver",
      text: `Hello ${fullName}, your loan for ${loanAmount} has been approved. Please sign and return the attached loan agreement.`,
      html,
      ...(attachments.length ? { attachments } : {}),
    };

    try {
      await sgMail.send(msg);
      console.info(`Loan approval email sent to ${member.email} for loan ${loan._id}`);
    } catch (sendErr) {
      console.error("Failed to send loan approval email:", sendErr?.response?.body || sendErr);
      return res.status(200).json({
        status: "success",
        message: "Loan is approved (email send failed).",
        emailError: sendErr?.response?.body || sendErr.message || String(sendErr)
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Loan approval email sent to user.",
    });
  } catch (err) {
    console.error("sendLoanApprovalEmail error:", err);
    return res.status(500).json({ status: "error", message: "Failed to send approval email", error: err.message });
  }
};

// New: serve the static loan agreement PDF for frontend downloads (no loan id required)
const downloadLoanAgreement = (req, res) => {
  try {
    const pdfPath = path.join(__dirname, "..", "resources", "loan_agreement.pdf");

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        status: "error",
        message: "Loan agreement not found"
      });
    }

    // Set headers and stream file
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="loan_agreement.pdf"');

    const stream = fs.createReadStream(pdfPath);
    stream.on("error", (err) => {
      console.error("Error streaming loan agreement:", err);
      if (!res.headersSent) {
        res.status(500).json({ status: "error", message: "Failed to download file" });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch (err) {
    console.error("downloadLoanAgreement error:", err);
    res.status(500).json({ status: "error", message: "Failed to download loan agreement" });
  }
};

module.exports = {
  getAllLoans,
  getSingleLoan,
  requestingLoan,
  approvingLoan,
  repaymentLoan,
  sendLoanApprovalEmail,
  downloadLoanAgreement, // new export
};
