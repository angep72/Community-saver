const User = require("../models/User");
const jwt = require("jsonwebtoken");
const AuditLog = require("../models/AuditLog");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

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
    console.error('Login error:', error);
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

// Forgot Password - FIXED VERSION
const forgotPasswordController = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user) {
      // Generate token and expiry
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

      // IMPORTANT: Use findByIdAndUpdate to avoid triggering password hashing
      await User.findByIdAndUpdate(user._id, {
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetTokenExpiry
      });


      // Mailtrap SMTP transport
      const transporter = nodemailer.createTransport({
        host: "sandbox.smtp.mailtrap.io",
        port: 2525,
        auth: {
          user: "0a333f61897aab",
          pass: "cedf131d02fbf2",
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
      const mailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #2d3748;">Password Reset Request</h2>
          <p>Hello${user.firstName ? ` ${user.firstName}` : ""},</p>
          <p>You requested to reset your password for your Community Saver account.</p>
          <p>
            <a href="${resetUrl}" style="background: #3182ce; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
              Reset Password
            </a>
          </p>
          <p>If you did not request this, please ignore this email.</p>
          <hr>
          <small>This link will expire in 1 hour.</small>
        </div>
      `;

      await transporter.sendMail({
        to: user.email,
        from: '"Community Saver" <no-reply@communitysaver.com>',
        subject: "Reset Your Community Saver Password",
        html: mailHtml,
      });

    }
    // Always respond with success for security
    res.json({ message: "Password reset link sent" });
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    res.json({ message: "Password reset link sent" });
  }
};

// Reset Password - ENHANCED WITH DEBUGGING
const resetPasswordController = async (req, res) => {
  const { token, newPassword, email } = req.body;
  try {

    // First check if user exists
    const userExists = await User.findOne({ email });
    if (!userExists) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // Find user with all conditions
    const user = await User.findOne({
      email,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }
    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();    
    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("❌ Password reset error:", error);
    res.status(500).json({ 
      message: "Password reset failed", 
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