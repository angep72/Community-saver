const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  validatePenalty,
  handleValidationErrors,
} = require("../middleware/validation");
const {
  getAllPenalties,
  getSinglePenalty,
  createPenality,
  payPenalty,
  waivePenalty,
  getTotalPenaltiesCollected
} = require("../controller/penalties");

const router = express.Router();

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /penalties:
 *   get:
 *     summary: Get all penalties
 *     tags: [Penalties]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all penalties
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Penalty'
 */
// @route   GET /api/penalties
// @desc    Get penalties
// @access  Admin (all), Branch Lead (branch), Member (own)
router.get("/total-penalties",getTotalPenaltiesCollected)

router.get("/", getAllPenalties);

/**
 * @swagger
 * /penalties/{id}:
 *   get:
 *     summary: Get penalty by ID
 *     tags: [Penalties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Penalty ID
 *     responses:
 *       200:
 *         description: Penalty details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Penalty'
 *       404:
 *         description: Penalty not found
 */
// @route   GET /api/penalties/:id
// @desc    Get penalty by ID
// @access  Admin, Branch Lead (branch), Member (own)
router.get("/:id", getSinglePenalty);

/**
 * @swagger
 * /penalties:
 *   post:
 *     summary: Assign penalty
 *     tags: [Penalties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Penalty'
 *     responses:
 *       201:
 *         description: Penalty assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Penalty'
 *       400:
 *         description: Validation error
 */
// @route   POST /api/penalties
// @desc    Assign penalty
// @access  Admin, Branch Lead
router.post(
  "/",
  authorize("admin", "branch_lead"),
  validatePenalty,
  handleValidationErrors,
  createPenality
);

/**
 * @swagger
 * /penalties/{id}/pay:
 *   post:
 *     summary: Mark penalty as paid
 *     tags: [Penalties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Penalty ID
 *     responses:
 *       200:
 *         description: Penalty marked as paid
 *       404:
 *         description: Penalty not found
 */
// @route   POST /api/penalties/:id/pay
// @desc    Mark penalty as paid
// @access  Admin, Branch Lead (own branch)

router.post("/:id/pay", authorize("admin", "branch_lead"), payPenalty);

/**
 * @swagger
 * /penalties/{id}/waive:
 *   post:
 *     summary: Waive penalty
 *     tags: [Penalties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Penalty ID
 *     responses:
 *       200:
 *         description: Penalty waived
 *       404:
 *         description: Penalty not found
 */
// @route   POST /api/penalties/:id/waive
// @desc    Waive penalty
// @access  Admin
router.post("/:id/waive", authorize("admin"), waivePenalty);

module.exports = router;
