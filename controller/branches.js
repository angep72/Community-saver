const Branch = require("../models/Branch");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");

const getAllBranch = async (req, res) => {
  try {
    let query = {};

    // Branch leads can only see their own branch
    if (req.user.role === "branch_lead") {
      query._id = req.user.branch._id;
    }

    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const branches = await Branch.find(query)
      .populate("branchLead", "firstName lastName email")
      .populate("memberCount")
      .sort({ name: 1 });

    res.status(200).json({
      status: "success",
      data: { branches },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get branches",
      error: error.message,
    });
  }
};

const getOneBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id)
      .populate("branchLead", "firstName lastName email phone")
      .populate("memberCount");

    if (!branch) {
      return res.status(404).json({
        status: "error",
        message: "Branch not found",
      });
    }

    // Branch leads can only view their own branch
    if (
      req.user.role === "branch_lead" &&
      branch._id.toString() !== req.user.branch._id.toString()
    ) {
      return res.status(403).json({
        status: "error",
        message: "Access denied. You can only view your own branch.",
      });
    }

    res.status(200).json({
      status: "success",
      data: { branch },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get branch",
      error: error.message,
    });
  }
};

const createBranch = async (req, res) => {
  try {

    const branch = await Branch.create(req.body);

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "create_branch",
      resource: "branch",
      resourceId: branch._id,
      details: { name: branch.name, code: branch.code },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(201).json({
      status: "success",
      message: "Branch created successfully",
      data: { branch },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: "error",
        message: "Branch with this name or code already exists",
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to create branch",
      error: error.message,
    });
  }
};

const updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("branchLead", "firstName lastName email");

    if (!branch) {
      return res.status(404).json({
        status: "error",
        message: "Branch not found",
      });
    }

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "update_branch",
      resource: "branch",
      resourceId: branch._id,
      details: req.body,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Branch updated successfully",
      data: { branch },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to update branch",
      error: error.message,
    });
  }
};

const deletingBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!branch) {
      return res.status(404).json({
        status: "error",
        message: "Branch not found",
      });
    }

    // Deactivate all users in this branch
    await User.updateMany({ branch: req.params.id }, { isActive: false });

    // Log the action
    await AuditLog.create({
      user: req.user._id,
      action: "delete_branch",
      resource: "branch",
      resourceId: branch._id,
      details: { name: branch.name },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(200).json({
      status: "success",
      message: "Branch deactivated successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to delete branch",
      error: error.message,
    });
  }
};

module.exports = {
  getAllBranch,
  getOneBranch,
  createBranch,
  updateBranch,
  deletingBranch,
};
