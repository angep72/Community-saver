const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const {
  getAllBranch,
  getOneBranch,
  createBranch,
  updateBranch,
  deletingBranch,
} = require("../controller/branches");

const router = express.Router();

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /branches:
 *   get:
 *     summary: Get all branches
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all branches
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Branch'
 */
// @route   GET /api/branches
// @desc    Get all branches
// @access  Admin, Branch Lead (limited)
router.get("/", getAllBranch);

/**
 * @swagger
 * /branches/{id}:
 *   get:
 *     summary: Get branch by ID
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     responses:
 *       200:
 *         description: Branch details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Branch'
 *       404:
 *         description: Branch not found
 */
// @route   GET /api/branches/:id
// @desc    Get branch by ID
// @access  Admin, Branch Lead (own branch)
router.get("/:id", getOneBranch);

/**
 * @swagger
 * /branches:
 *   post:
 *     summary: Create a new branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 example: Downtown Branch
 *               code:
 *                 type: string
 *                 example: DT001
 *     responses:
 *       201:
 *         description: Branch created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Branch'
 *       400:
 *         description: Validation error
 */
// @route   POST /api/branches
// @desc    Create new branch
// @access  Admin
router.post("/", authorize("admin"), createBranch);

/**
 * @swagger
 * /branches/{id}:
 *   put:
 *     summary: Update a branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Updated Branch Name
 *               code:
 *                 type: string
 *                 example: UPD001
 *     responses:
 *       200:
 *         description: Branch updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Branch'
 *       404:
 *         description: Branch not found
 */
// @route   PUT /api/branches/:id
// @desc    Update branch
// @access  Admin
router.put("/:id", authorize("admin"), updateBranch);

/**
 * @swagger
 * /branches/{id}:
 *   delete:
 *     summary: Delete a branch (soft delete)
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     responses:
 *       200:
 *         description: Branch deleted successfully
 *       404:
 *         description: Branch not found
 */
// @route   DELETE /api/branches/:id
// @desc    Delete branch (soft delete)
// @access  Admin
router.delete("/:id", authorize("admin"), deletingBranch);

module.exports = router;
