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

    // Create user with status defaulting to 'pending'
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: role || "member",
      branch,
      status: "pending", 
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
    
    console.log('Login attempt:', { email, password: password ? '[PROVIDED]' : '[MISSING]' });

    // Find user and include password
    const user = await User.findOne({ email })
      .select("+password")
      .populate("branch");

    console.log('User found:', user ? { id: user._id, email: user.email, isActive: user.isActive, status: user.status } : 'NOT FOUND');

    if (!user) {
      console.log('Login failed: User not found');
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      console.log('Login failed: User not active');
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

    // If not admin, check if user is approved
    if (user.role !== "admin" && user.status !== "approved") {
      console.log('Login failed: User not approved, status:', user.status);
      return res.status(403).json({
        status: "error",
        message: `Your account status is '${user.status}'. Please contact the admin for approval.`,
        userStatus: user.status,
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

    console.log('Login successful for user:', user.email);

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
