const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const { protect, authorize } = require("../middleware/auth");
const User = require("../models/User");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const router = express.Router();

// Report schema - now storing file data in database
const reportSchema = new mongoose.Schema({
  originalname: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedAt: { type: Date, default: Date.now },
  description: String,
  fileData: Buffer, // Store the actual file binary data
  mimetype: String, // Store the file type (e.g., 'application/pdf')
  size: Number, // Store file size in bytes
});

const Report = mongoose.models.Report || mongoose.model("Report", reportSchema);

// Use memory storage instead of disk storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024 // 16MB limit (MongoDB document limit is 16MB)
  }
});

// Multer error handler middleware
function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: "error",
        message: "File size exceeds 16MB limit"
      });
    }
    return res.status(400).json({
      status: "error",
      message: err.code === "LIMIT_UNEXPECTED_FILE"
        ? "File field name must be 'report'"
        : err.message,
    });
  }
  next(err);
}

// Admin uploads a PDF report
router.post(
  "/upload",
  protect,
  authorize("admin"),
  upload.single("report"),
  multerErrorHandler,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: "error",
          message: "No file uploaded. Field name must be 'report'.",
        });
      }

      // Store file data in database (no branch saved)
      const report = await Report.create({
        originalname: req.file.originalname,
        uploadedBy: req.user._id,
        description: req.body.description || "",
        fileData: req.file.buffer, // Store the file buffer
        mimetype: req.file.mimetype,
        size: req.file.size
      });

      // Return report without the large fileData field and without any branch value
      const reportResponse = report.toObject();
      delete reportResponse.fileData;
      // ensure branch removed if present
      if (reportResponse.branch) delete reportResponse.branch;
      if (reportResponse.uploadedBy && reportResponse.uploadedBy.branch) delete reportResponse.uploadedBy.branch;

      res.status(201).json({
        status: "success",
        message: "Report uploaded successfully",
        data: { report: reportResponse },
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        message: "Failed to upload report",
        error: error.message,
      });
    }
  }
);

// List all available reports (all users)
router.get("/", protect, async (req, res) => {
  try {
    // Exclude fileData from the list to improve performance
    let reports = await Report.find()
      .select('-fileData') // Exclude the large binary field
      .populate("uploadedBy", "firstName lastName email")
      .sort({ uploadedAt: -1 })
      .lean();

    // Remove branch value from each report (and from uploadedBy if present)
    reports = reports.map(r => {
      if (r.branch) delete r.branch;
      if (r.uploadedBy && r.uploadedBy.branch) delete r.uploadedBy.branch;
      return r;
    });

    res.json({
      status: "success",
      data: { reports },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// Download a specific report
router.get("/:id/download", protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Report not found"
      });
    }

    // Set appropriate headers
    res.set({
      'Content-Type': report.mimetype,
      'Content-Disposition': `attachment; filename="${report.originalname}"`,
      'Content-Length': report.size
    });

    // Send the file buffer
    res.send(report.fileData);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to download report",
      error: error.message,
    });
  }
});

// Send PDF report to all users (admin only)
router.post(
  "/send-pdf",
  protect,
  authorize("admin"),
  upload.single("pdf"),
  multerErrorHandler,
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          message: "PDF file is required."
        });
      }

      // Check attachment size (SendGrid limit is 20MB)
      if (req.file.size > 20 * 1024 * 1024) {
        return res.status(400).json({
          message: "Attachment exceeds 20MB limit."
        });
      }

      // Get all user emails, excluding admins
      const users = await User.find({ role: { $ne: "admin" } }, "email");
      const emails = users.map((u) => u.email);

      if (emails.length === 0) {
        return res.status(404).json({
          message: "No users found."
        });
      }

      const msg = {
        to: emails,
        from: process.env.SENDGRID_VERIFIED_SENDER,
        subject: "Financial Management System Report",
        text: "A new report has been sent from the Financial Management System. Please find the attached PDF.",
        html: "<p>A new report has been sent from the <b>Financial Management System</b>. Please find the attached PDF.</p>",
        attachments: [
          {
            content: req.file.buffer.toString("base64"),
            filename: req.file.originalname,
            type: req.file.mimetype,
            disposition: "attachment",
          },
        ],
      };

      await sgMail.sendMultiple(msg);

      res.status(200).json({
        message: "Report sent to all users."
      });
    } catch (err) {
      console.error("SendGrid error:", err?.response?.body || err);
      res.status(500).json({
        message: "Failed to send report.",
        error: err?.response?.body || err.message
      });
    }
  }
);

// Delete all reports (admin only)
router.delete("/delete-all", protect, authorize("admin"), async (req, res) => {
  try {
    const result = await Report.deleteMany({});

    res.status(200).json({
      status: "success",
      message: `Successfully deleted ${result.deletedCount} report(s)`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to delete reports",
      error: error.message,
    });
  }
});

module.exports = router;