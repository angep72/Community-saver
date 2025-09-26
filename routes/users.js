// @route   GET /api/users/shares
// @desc    Get member shares and potential interest
// @access  Protected
const express = require("express");

const { protect, authorize } = require("../middleware/auth");
const {
  validateRegister,
  handleValidationErrors,
} = require("../middleware/validation");
const {
  getAllUsers,
  getOneUser,
  createUser,
  editUser,
  deleteUser,
  getUserShares,
  getMemberShares,
} = require("../controller/users");

const router = express.Router();

// All routes are protected
router.use(protect);

router.get("/shares", getMemberShares);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users (Admin) or branch users (Branch Lead)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
// @route   GET /api/users
// @desc    Get all users (Admin) or branch users (Branch Lead)
// @access  Admin, Branch Lead
router.get("/", authorize("admin", "branch_lead", "member"), getAllUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Admin, Branch Lead (own branch), Member (own profile)
router.get("/:id", getOneUser);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 */
// @route   POST /api/users
// @desc    Create new user
// @access  Admin
router.post(
  "/",
  authorize("admin"),
  validateRegister,
  handleValidationErrors,
  createUser
);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
// @route   PUT /api/users/:id
// @desc    Update user
// @access  Admin, Member (own profile)
router.put("/:id", editUser);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user (soft delete)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
// @route   DELETE /api/users/:id
// @desc    Delete user (soft delete)
// @access  Admin
router.delete("/:id", authorize("admin"), deleteUser);

/**
 * @swagger
 * /users/shares:
 *   get:
 *     summary: Get shares of each user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user shares
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   branch:
 *                     type: string
 *                   totalContributions:
 *                     type: number
 *                   percentage:
 *                     type: number
 */
// @route   GET /api/users/shares
// @desc    Get shares of each user (name, branch, totalContributions, percentage)
// @access  Admin, Branch Lead
router.get("/shares", authorize("admin", "branch_lead"), getUserShares);

module.exports = router;
