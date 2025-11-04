const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { adminDashboard, branchDashboard, memberDashboard } = require('../controller/dashboard')

const router = express.Router();

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /dashboard/admin:
 *   get:
 *     summary: Get admin dashboard data
 *     description: Returns dashboard data for admin users.
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// @route   GET /api/dashboard/admin
// @desc    Get admin dashboard data
// @access  Admin
router.get('/admin', authorize('admin'), adminDashboard);

/**
 * @swagger
 * /dashboard/branch-lead:
 *   get:
 *     summary: Get branch lead dashboard data
 *     description: Returns dashboard data for branch lead users.
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Branch lead dashboard data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// @route   GET /api/dashboard/branch-lead
// @desc    Get branch lead dashboard data
// @access  Branch Lead
router.get('/branch-lead', authorize('branch_lead'), branchDashboard);

/**
 * @swagger
 * /dashboard/member:
 *   get:
 *     summary: Get member dashboard data
 *     description: Returns dashboard data for member users.
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Member dashboard data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// @route   GET /api/dashboard/member
// @desc    Get member dashboard data
// @access  Member
router.get('/member', authorize('member'), memberDashboard);

module.exports = router;