const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { protect, authorize } = require("../middleware/auth");

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

module.exports = router;
