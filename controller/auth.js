const User = require("../models/User");
const jwt = require("jsonwebtoken");
const AuditLog = require("../models/AuditLog");
const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};

const registerController = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, branch } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }],
    });

    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User with this email already exists",
      });
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: role || "member",
      branch,
      status: "pending", 
    });

    const token = generateToken(user._id);
  
    await AuditLog.create({
      user: user._id,
      action: "register",
      resource: "auth",
      details: { email, role: user.role },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(201).json({
      status: "success",
      message: "User registered successfully",
      data: {
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Registration failed",
      error: error.message,
    });
  }
};

const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email })
      .select("+password")
      .populate("branch");
    
    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        status: "error",
        message: "Account is deactivated. Contact administrator.",
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    if (user.role !== "admin" && user.status !== "approved") {
      return res.status(403).json({
        status: "error",
        message: `Your account status is '${user.status}'. Please contact the admin for approval.`,
        userStatus: user.status,
      });
    }

    await user.updateLastLogin();

    const token = generateToken(user._id);

    await AuditLog.create({
      user: user._id,
      action: "login",
      resource: "auth",
      details: { email },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: {
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          branch: user.branch,
          totalContributions: user.totalContributions,
          totalLoans: user.totalLoans,
          totalPenalties: user.totalPenalties,
          lastLogin: user.lastLogin,
          status: user.status,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Login failed",
      error: error.message,
    });
  }
};

const logoutController = async (req, res) => {
  try {
    await AuditLog.create({
      user: req.user._id,
      action: "logout",
      resource: "auth",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Logout successful",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Logout failed",
      error: error.message,
    });
  }
};

const profileController = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("branch");

    res.status(200).json({
      status: "success",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          branch: user.branch,
          totalContributions: user.totalContributions,
          totalLoans: user.totalLoans,
          totalPenalties: user.totalPenalties,
          joinDate: user.joinDate,
          lastLogin: user.lastLogin,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get profile",
      error: error.message,
    });
  }
};

// Forgot Password - Fixed to handle multiple frontend URLs and proper encoding
const forgotPasswordController = async (req, res) => {
  const { email } = req.body;
  
  try {
    // Validate email input
    if (!email || !email.trim()) {
      return res.status(400).json({ 
        status: "error",
        message: "Email is required" 
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    
    if (user) {
      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour


      // Save token to database - Use findByIdAndUpdate to avoid password hashing
      await User.findByIdAndUpdate(user._id, {
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetTokenExpiry
      });

      // Handle multiple frontend URLs properly
      const frontendUrls = (process.env.FRONTEND_URL || "http://localhost:5173").split(",");
      const frontendUrl = frontendUrls[0].trim();
      
      // Construct reset URL with proper encoding
      const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;

      
      // Email HTML template
      const mailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
          <h2 style="color: #2d3748;">Password Reset Request</h2>
          <p>Hello${user.firstName ? ` ${user.firstName}` : ""},</p>
          <p>You requested to reset your password for your Community Saver account.</p>
          <p style="margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #0f766e; 
                      color: #fff; 
                      padding: 12px 24px; 
                      text-decoration: none; 
                      border-radius: 4px;
                      display: inline-block;
                      font-weight: 500;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="background: #f7fafc; 
                    padding: 10px; 
                    border-radius: 4px; 
                    word-break: break-all;
                    font-size: 12px;
                    color: #4a5568;
                    font-family: monospace;">
            ${resetUrl}
          </p>
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            If you did not request this password reset, please ignore this email and your password will remain unchanged.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          <small style="color: #999;">This link will expire in 1 hour for security reasons.</small>
        </div>
      `;

      // Send email via SendGrid
      await sgMail.send({
        to: user.email,
        from: process.env.SENDGRID_VERIFIED_SENDER,
        subject: "Reset Your Community Saver Password",
        html: mailHtml,
      });

    } else {
    }
    
    // Always respond with success for security (don't reveal if email exists)
    res.status(200).json({ 
      status: "success",
      message: "If an account exists with that email, a password reset link has been sent." 
    });
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    
    // Don't expose internal errors to the user
    res.status(500).json({ 
      status: "error",
      message: "Failed to process password reset request. Please try again later." 
    });
  }
};

// Reset Password - Enhanced with better validation and error handling
const resetPasswordController = async (req, res) => {
  const { token, newPassword, email } = req.body;
  
  try {
    // Validate inputs
    if (!token || !newPassword || !email) {
      return res.status(400).json({ 
        status: "error",
        message: "Token, email, and new password are required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        status: "error",
        message: "Password must be at least 6 characters long" 
      });
    }

    // Find user with valid token
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ 
        status: "error",
        message: "Invalid or expired reset token. Please request a new password reset." 
      });
    }

    // Update password and clear reset token fields
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Log the password reset action
    await AuditLog.create({
      user: user._id,
      action: "password_reset",
      resource: "auth",
      details: { email: user.email },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({ 
      status: "success",
      message: "Password reset successful. You can now log in with your new password." 
    });
  } catch (error) {
    res.status(500).json({ 
      status: "error",
      message: "Password reset failed. Please try again.", 
      error: error.message 
    });
  }
};

module.exports = {
  registerController,
  loginController,
  logoutController,
  profileController,
  forgotPasswordController,
  resetPasswordController,
};