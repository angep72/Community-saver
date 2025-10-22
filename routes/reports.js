const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { protect, authorize } = require("../middleware/auth");
const User = require("../models/User");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const router = express.Router();

// Report metadata schema
const reportSchema = new mongoose.Schema({
  filename: String,
  originalname: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedAt: { type: Date, default: Date.now },
  description: String,
});
const Report = mongoose.models.Report || mongoose.model("Report", reportSchema);

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "../reports");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname);
  },
});
const upload = multer({ storage });
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Multer error handler middleware
function multerErrorHandler(err, req, res, next) {
  if (err instanceof require("multer").MulterError) {
    return res.status(400).json({
      status: "error",
      message:
        err.message === "LIMIT_UNEXPECTED_FILE"
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
  multerErrorHandler, // Add this after multer
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            status: "error",
            message: "No file uploaded. Field name must be 'report'.",
          });
      }
      const report = await Report.create({
        filename: req.file.filename,
        originalname: req.file.originalname,
        uploadedBy: req.user._id,
        description: req.body.description || "",
      });
      res.status(201).json({
        status: "success",
        message: "Report uploaded successfully",
        data: { report },
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
    const reports = await Report.find()
      .populate("uploadedBy", "firstName lastName email")
      .sort({ uploadedAt: -1 });
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
      return res.status(404).json({ status: "error", message: "Report not found" });
    }
    const filePath = path.join(__dirname, "../reports", report.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ status: "error", message: "File not found" });
    }
    res.download(filePath, report.originalname);
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
  uploadMemory.single("pdf"),
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: "PDF file is required." });
      }

      // Check attachment size (SendGrid limit is 20MB)
      if (req.file.size > 20 * 1024 * 1024) {
        return res.status(400).json({ message: "Attachment exceeds 20MB limit." });
      }

      // Get all user emails as an array of strings, excluding admins
      const users = await User.find({ role: { $ne: "admin" } }, "email");
      const emails = users.map((u) => u.email);
      if (emails.length === 0) {
        
        return res.status(404).json({ message: "No users found." });
      }

      const msg = {
        to: emails, // array of email strings
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

      res.status(200).json({ message: "Report sent to all users." });
    } catch (err) {
      console.error("SendGrid error:", err?.response?.body || err);
      res.status(500).json({ message: "Failed to send report.", error: err?.response?.body || err.message });
    }
  }
);

module.exports = router;
