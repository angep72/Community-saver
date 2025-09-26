const mongoose = require("mongoose");
const User = require("../models/User");


const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Branch name is required"],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Branch code is required"],
      unique: true,
      uppercase: true,
    },
    branchLead: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    establishedDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-save hook to set branchLead to admin if not set
branchSchema.pre("save", async function (next) {
  if (!this.branchLead) {
    const adminUser = await User.findOne({ role: "admin" }); // Adjust field if needed
    if (adminUser) {
      this.branchLead = adminUser._id;
    }
  }
  next();
});

// Virtual for member count
branchSchema.virtual("memberCount", {
  ref: "User",
  localField: "_id",
  foreignField: "branch",
  count: true,
});

module.exports = mongoose.model("Branch", branchSchema);
