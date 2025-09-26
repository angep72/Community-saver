const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {adminDashboard, branchDashboard,memberDashboard} = require('../controller/dashboard')

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   GET /api/dashboard/admin
// @desc    Get admin dashboard data
// @access  Admin
router.get('/admin', authorize('admin'),adminDashboard );

// @route   GET /api/dashboard/branch-lead
// @desc    Get branch lead dashboard data
// @access  Branch Lead
router.get('/branch-lead', authorize('branch_lead'),branchDashboard );

// @route   GET /api/dashboard/member
// @desc    Get member dashboard data
// @access  Member
router.get('/member', authorize('member'),memberDashboard );

module.exports = router;