const Branch = require("../models/Branch");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");

/**
 * @swagger
 * /api/branches:
 *   get:
 *     summary: Get all branches (with optional filters)
 *     tags: [Branches]
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of branches
 *       500:
 *         description: Failed to get branches
 */
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

/**
 * @swagger
 * /api/branches/{id}:
 *   get:
 *     summary: Get a single branch by ID
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     responses:
 *       200:
 *         description: Branch details
 *       404:
 *         description: Branch not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Failed to get branch
 */
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

/**
 * @swagger
 * /api/branches:
 *   post:
 *     summary: Create a new branch
 *     tags: [Branches]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               branchLead:
 *                 type: string
 *     responses:
 *       201:
 *         description: Branch created successfully
 *       400:
 *         description: Branch with this name or code already exists
 *       500:
 *         description: Failed to create branch
 */
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

/**
 * @swagger
 * /api/branches/{id}:
 *   put:
 *     summary: Update a branch by ID
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Branch updated successfully
 *       404:
 *         description: Branch not found
 *       500:
 *         description: Failed to update branch
 */
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

/**
 * @swagger
 * /api/branches/{id}:
 *   delete:
 *     summary: Deactivate a branch by ID (soft delete)
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Branch ID
 *     responses:
 *       200:
 *         description: Branch deactivated successfully
 *       404:
 *         description: Branch not found
 *       500:
 *         description: Failed to delete branch
 */
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
