const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");

const { protect } = require("../middleware/auth");
const {
  validateRegister,
  validateLogin,
  handleValidationErrors,
} = require("../middleware/validation");
const {
  registerController,
  loginController,
  logoutController,
  profileController,
  forgotPasswordController,
  resetPasswordController,
} = require("../controller/auth");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication and authorization
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: password123
 *               role:
 *                 type: string
 *                 enum: [admin, branch_lead, member]
 *                 default: member
 *               branch:
 *                 type: string
 *                 description: Required for branch_lead and member roles
 *     responses:
 *       201:
 *         description: User registered successfully
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
 *                         token:
 *                           type: string
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Generate JWT token

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public (but in production, this might be restricted)
router.post(
  "/register",
  validateRegister,
  handleValidationErrors,
  registerController
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
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
 *                         token:
 *                           type: string
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials or account deactivated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", validateLogin, handleValidationErrors, loginController);

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal, server-side log)
// @access  Private
router.post("/logout", protect, logoutController);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
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
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get("/profile", protect, profileController);
// Replace your Google OAuth routes in routes/auth.js

// Initiate Google OAuth
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

// Handle Google OAuth callback
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: (process.env.FRONTEND_URL || "http://localhost:3000") + "/login?error=auth_failed",
    session: false,
  }),
  (req, res) => {
    try {
      // If Passport failed, req.user will be false and req.authInfo may contain the error
      if (!req.user) {
        const errorMsg = req.authInfo && req.authInfo.message
          ? req.authInfo.message
          : "User does not have an account.";
        return res.redirect(
          `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=${encodeURIComponent(errorMsg)}`
        );
      }


      // Generate JWT token with proper fallbacks
      const token = jwt.sign(
        {
          id: req.user._id,
          email: req.user.email,
          role: req.user.role,
        },
        process.env.JWT_SECRET || "your_jwt_secret_fallback",
        { expiresIn: process.env.JWT_EXPIRE || "7d" }
      );
      // Build redirect URL
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const redirectUrl = `${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}&role=${req.user.role}`;

      // Redirect to frontend callback with token and role
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("❌ OAuth callback error:", error);
      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=callback_error`
      );
    }
  }
);

// Forgot Password
router.post("/forgot-password", forgotPasswordController);

// Reset Password route
router.post("/reset-password", resetPasswordController);

module.exports = router;
