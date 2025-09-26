// Net available: total contributions minus total approved loans


const express = require("express");

const { protect, authorize } = require("../middleware/auth");
const {
  validateContribution,
  handleValidationErrors,
} = require("../middleware/validation");
const {
  getAllContribution,
  getOneContribution,
  createContribution,
  updatingContribution,
  deletingContribution,
  getTotalContributions,
  getNetContributions
} = require("../controller/contributions");

const router = express.Router();

// All routes are protected
router.use(protect);
router.get("/net", getNetContributions);


router.get("/total", getTotalContributions);

/**
 * @swagger
 * /contributions:
 *   get:
 *     summary: Get all contributions
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all contributions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Contribution'
 */
// @route   GET /api/contributions
// @desc    Get contributions
// @access  Admin (all), Branch Lead (branch), Member (own)
router.get("/", getAllContribution);

/**
 * @swagger
 * /contributions/{id}:
 *   get:
 *     summary: Get contribution by ID
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contribution ID
 *     responses:
 *       200:
 *         description: Contribution details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contribution'
 *       404:
 *         description: Contribution not found
 */
// @route   GET /api/contributions/:id
// @desc    Get contribution by ID
// @access  Admin, Branch Lead (branch), Member (own)
router.get("/:id", getOneContribution);

/**
 * @swagger
 * /contributions:
 *   post:
 *     summary: Add new contribution
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Contribution'
 *     responses:
 *       201:
 *         description: Contribution created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contribution'
 *       400:
 *         description: Validation error
 */
// @route   POST /api/contributions
// @desc    Add new contribution
// @access  Admin, Branch Lead
router.post(
  "/",
  authorize("admin", "branch_lead"),
  handleValidationErrors,
  createContribution,
  deletingContribution
);

/**
 * @swagger
 * /contributions/{id}:
 *   put:
 *     summary: Update contribution
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contribution ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Contribution'
 *     responses:
 *       200:
 *         description: Contribution updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contribution'
 *       404:
 *         description: Contribution not found
 */
// @route   PUT /api/contributions/:id
// @desc    Update contribution
// @access  Admin, Branch Lead (own branch)
router.put("/:id", authorize("admin", "branch_lead"), updatingContribution);

/**
 * @swagger
 * /contributions/{id}:
 *   delete:
 *     summary: Delete contribution
 *     tags: [Contributions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contribution ID
 *     responses:
 *       200:
 *         description: Contribution deleted successfully
 *       404:
 *         description: Contribution not found
 */
// @route   DELETE /api/contributions/:id
// @desc    Delete contribution
// @access  Admin
router.delete("/:id", authorize("admin"), deletingContribution);

module.exports = router;
