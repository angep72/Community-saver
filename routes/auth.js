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
 * Helper function to get the correct frontend URL
 */
const getFrontendUrl = (returnUrl) => {
  const frontendUrls = (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map(url => url.trim());
  
  // If returnUrl is provided and matches one of our allowed URLs, use it
  if (returnUrl) {
    const matchingUrl = frontendUrls.find(url => returnUrl.startsWith(url));
    if (matchingUrl) {
      console.log("🎯 Using provided returnUrl:", matchingUrl);
      return matchingUrl;
    }
  }

  // Fallback to environment-based selection
  if (process.env.NODE_ENV === "production") {
    const prodUrl = frontendUrls.find(url => !url.includes("localhost")) || frontendUrls[0];
    console.log("🎯 Using production default:", prodUrl);
    return prodUrl;
  }
  
  const devUrl = frontendUrls.find(url => url.includes("localhost")) || frontendUrls[0];
  console.log("🎯 Using development default:", devUrl);
  return devUrl;
};

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

// Initiate Google OAuth - CAPTURES returnUrl in state parameter
router.get(
  "/google",
  (req, res, next) => {
    // Get returnUrl from query parameter
    const returnUrl = req.query.returnUrl;
    
    console.log("🚀 Initiating Google OAuth");
    console.log("📍 Return URL from frontend:", returnUrl);
    
    // Store returnUrl in session state to retrieve after OAuth callback
    const state = returnUrl ? Buffer.from(returnUrl).toString('base64') : '';
    
    passport.authenticate("google", {
      scope: ["profile", "email"],
      state: state, // Pass returnUrl through OAuth state
    })(req, res, next);
  }
);

// Handle Google OAuth callback - RETRIEVES returnUrl from state parameter
router.get(
  "/google/callback",
  (req, res, next) => {
    // Decode returnUrl from state parameter
    const state = req.query.state;
    let returnUrl = null;
    
    if (state) {
      try {
        returnUrl = Buffer.from(state, 'base64').toString('utf-8');
        console.log("📍 Decoded return URL from state:", returnUrl);
      } catch (e) {
        console.error("❌ Failed to decode state parameter:", e);
      }
    }
    
    // Store returnUrl in req for use in the callback handler
    req.returnUrl = returnUrl;
    
    passport.authenticate("google", {
      failureRedirect: (() => {
        const frontendUrl = getFrontendUrl(returnUrl);
        return `${frontendUrl}/login?error=auth_failed`;
      })(),
      session: false,
    })(req, res, next);
  },
  (req, res) => {
    try {
      // Use the returnUrl we stored earlier
      const frontendUrl = getFrontendUrl(req.returnUrl);
      
      console.log("🔐 Google OAuth callback - NODE_ENV:", process.env.NODE_ENV);
      console.log("🌐 Selected frontend URL:", frontendUrl);
      console.log("🔗 Return URL from state:", req.returnUrl);

      if (!req.user) {
        const errorMsg = req.authInfo && req.authInfo.message
          ? req.authInfo.message
          : "User does not have an account.";
        
        console.log("❌ OAuth failed:", errorMsg);
        return res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`
        );
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: req.user._id,
          email: req.user.email,
          role: req.user.role,
        },
        process.env.JWT_SECRET || "your_jwt_secret_fallback",
        { expiresIn: process.env.JWT_EXPIRE || "7d" }
      );

      console.log("✅ OAuth successful for:", req.user.email);

      const redirectUrl = `${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}&role=${req.user.role}`;
      
      console.log("🔗 Redirecting to:", redirectUrl);
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("❌ OAuth callback error:", error);
      const frontendUrl = getFrontendUrl(req.returnUrl);
      res.redirect(
        `${frontendUrl}/login?error=callback_error`
      );
    }
  }
);

// Forgot Password
router.post("/forgot-password", forgotPasswordController);

// Reset Password route
router.post("/reset-password", resetPasswordController);

module.exports = router;