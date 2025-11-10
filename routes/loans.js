const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  validateLoan,
  validateLoanApproval,
  handleValidationErrors,
} = require("../middleware/validation");
const {
  getAllLoans,
  getSingleLoan,
  requestingLoan,
  approvingLoan,
  repaymentLoan,
  sendLoanApprovalEmail,
  downloadLoanAgreement,
} = require("../controller/loans");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Loans
 *   description: Loan management operations
 */

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /loans:
 *   get:
 *     summary: Get loans with filtering and pagination
 *     tags: [Loans]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, disbursed, repaid, defaulted]
 *         description: Filter by loan status
 *       - in: query
 *         name: member
 *         schema:
 *           type: string
 *         description: Filter by member ID (Admin/Branch Lead only)
 *     responses:
 *       200:
 *         description: Loans retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         loans:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Loan'
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             page: { type: integer }
 *                             limit: { type: integer }
 *                             total: { type: integer }
 *                             pages: { type: integer }
 *                         summary:
 *                           type: object
 *                           properties:
 *                             totalAmount: { type: number }
 *                             totalApproved: { type: number }
 *                             totalDisbursed: { type: number }
 *                             pending: { type: integer }
 */

// @route   GET /api/loans
// @desc    Get loans
// @access  Admin (all), Branch Lead (branch), Member (own)
router.get("/", getAllLoans);

// CRITICAL: Static routes must come BEFORE dynamic :id routes
// @route   GET /api/loans/loan-agreement
// @desc    Download the static loan agreement PDF
// @access  Protected (all authenticated users)
router.get("/loan-agreement", downloadLoanAgreement);

/**
 * @swagger
 * /loans:
 *   post:
 *     summary: Request a new loan (Members and Branch Leads)
 *     tags: [Loans]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - purpose
 *               - duration
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 1
 *                 example: 10000
 *               purpose:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 200
 *                 example: Business expansion and equipment purchase
 *               duration:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 60
 *                 example: 12
 *                 description: Loan duration in months
 *     responses:
 *       201:
 *         description: Loan request submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         loan:
 *                           $ref: '#/components/schemas/Loan'
 *       400:
 *         description: Validation error or pending loan exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access denied - Members and Branch Leads only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// @route   POST /api/loans
// @desc    Request new loan
// @access  Member, Branch Lead
router.post(
  "/",
  authorize("member", "branch_lead"),
  validateLoan,
  handleValidationErrors,
  requestingLoan
);

/**
 * @swagger
 * /loans/{id}/approve:
 *   post:
 *     summary: Approve or reject a loan
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
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
 *                 example: approved
 *               rejectionReason:
 *                 type: string
 *                 example: Insufficient collateral
 *     responses:
 *       200:
 *         description: Loan approved or rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Loan'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Loan not found
 */

// @route   POST /api/loans/:id/approve
// @desc    Approve or reject loan
// @access  Admin, Branch Lead
router.post(
  "/:id/approve",
  authorize("admin", "branch_lead"),
  validateLoanApproval,
  handleValidationErrors,
  approvingLoan
);

/**
 * @swagger
 * /loans/{id}/disburse:
 *   post:
 *     summary: Disburse approved loan
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Loan'
 *       404:
 *         description: Loan not found
 */

// @route   POST /api/loans/:id/disburse
// @desc    Disburse approved loan
// @access  Admin
router.post("/:id/disburse", authorize("admin"), repaymentLoan);

/**
 * @swagger
 * /loans/{id}/send-approval-email:
 *   post:
 *     summary: Send loan approval email (Admin only)
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Loan ID
 *     responses:
 *       200:
 *         description: Approval email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Loan not found
 */

// @route   POST /api/loans/:id/send-approval-email
// @desc    Trigger sending the approval email for a loan
// @access  Admin
router.post(
  "/:id/send-approval-email",
  authorize("admin"),
  sendLoanApprovalEmail
);

// @route   GET /api/loans/:id
// @desc    Get loan by ID
// @access  Admin, Branch Lead (branch), Member (own)
// NOTE: This MUST be last among GET routes because it's a catch-all for any ID
router.get("/:id", getSingleLoan);

module.exports = router;