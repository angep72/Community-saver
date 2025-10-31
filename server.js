// Contributions analytics route
// const contributionsAnalyticsRoutes = require("./routes/contributionsAnalytics");
// app.use("/api/contributions", contributionsAnalyticsRoutes);

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const swaggerSpecs = require("./config/swagger");
require("dotenv").config();

const connectDB = require("./config/database");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const contributionRoutes = require("./routes/contributions");
const loanRoutes = require("./routes/loans");
const penaltyRoutes = require("./routes/penalties");
const dashboardRoutes = require("./routes/dashboard");
const branchRoutes = require("./routes/branches");
const reportsRoutes = require("./routes/reports");

const app = express();

// Passport and session setup
const session = require("express-session");
const passport = require("passport");
require("./config/passport");

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Defaults
      const defaultOrigins = [
        "http://localhost:5173",
        "https://lovely-nougat-b6139b.netlify.app",
        "https://communitysaver.netlify.app",
        "http://localhost:5000",
      ];

      // Read SWAGGER_UI_URL (comma separated) and merge with defaults
      const swaggerOrigins = (process.env.SWAGGER_UI_URL || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const allowedOrigins = Array.from(new Set([...defaultOrigins, ...swaggerOrigins]));

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/contributions", contributionRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/penalties", penaltyRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/reports", reportsRoutes);

// API Documentation
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpecs, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Savings & Loan API Documentation",
  })
);
// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Savings & Loan API is running!",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
