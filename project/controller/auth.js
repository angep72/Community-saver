const User = require("../models/User");
const jwt = require("jsonwebtoken");
const AuditLog = require("../models/AuditLog");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};

const registerController = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, branch } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }],
    });

    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User with this email already exists",
      });
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: role || "member",
      branch,
    });

    // Generate token
    const token = generateToken(user._id);
    console.log(user._id);

    // Log the registration
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

    // Find user and include password
    const user = await User.findOne({ email })
      .select("+password")
      .populate("branch");

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        status: "error",
        message: "Account is deactivated. Contact administrator.",
      });
    }

    // Validate password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id);

    // Log the login
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
    // Log the logout
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
module.exports = {
  registerController,
  loginController,
  logoutController,
  profileController,
};
