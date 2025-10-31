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
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-side requests)
      if (!origin) return callback(null, true);

      // Helper: normalize entries (URLs or origins or wildcard domains) -> origin or wildcard string
      const normalizeEntry = (entry) => {
        if (!entry) return null;
        entry = entry.trim();
        // If entry contains wildcard like *.example.com keep as-is
        if (entry.startsWith("*.")) return entry.toLowerCase();
        // If looks like protocol+host or host:port, try to create URL and return origin
        try {
          // If entry lacks protocol, assume https for safety when parsing hostname only
          const maybeUrl = entry.match(/^https?:\/\//) ? entry : `https://${entry}`;
          const u = new URL(maybeUrl);
          return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`.toLowerCase();
        } catch (e) {
          // fallback: return entry lowercased (could be hostname or wildcard)
          return entry.toLowerCase();
        }
      };

      // Defaults
      const defaultOrigins = [
        "http://localhost:5173",
        "https://lovely-nougat-b6139b.netlify.app",
        "https://communitysaver.netlify.app",
        "http://localhost:5000",
      ];

      // Collect env lists (comma separated)
      const envList = (process.env.CORS_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
      const swaggerList = (process.env.SWAGGER_UI_URL || "").split(",").map((s) => s.trim()).filter(Boolean);

      // Normalize all entries (strip paths -> origins)
      const normalized = new Set();
      [...defaultOrigins, ...envList, ...swaggerList].forEach((item) => {
        const n = normalizeEntry(item);
        if (n) normalized.add(n);
      });

      const allowedOrigins = Array.from(normalized);
      // Log allowed origins once for troubleshooting (only in dev or when env var present)
      if (process.env.NODE_ENV === "development" || process.env.DEBUG_CORS === "true") {
        console.info("CORS allowed origins:", allowedOrigins);
      }

      // Normalize incoming origin for comparison
      let incomingOrigin = origin.toLowerCase();
      let incomingHostname = "";
      try {
        const u = new URL(incomingOrigin);
        incomingHostname = u.hostname.toLowerCase();
        incomingOrigin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
      } catch (e) {
        // leave incomingOrigin as-is
      }

      // Exact match
      if (allowedOrigins.includes(incomingOrigin) || allowedOrigins.includes(incomingOrigin.replace(/\/$/, ""))) {
        return callback(null, true);
      }

      // Match by hostname if allowedOrigins contains hostname-only entries
      if (allowedOrigins.includes(incomingHostname)) {
        return callback(null, true);
      }

      // Wildcard match support: allowed entry like *.example.com
      const wildcardMatch = allowedOrigins.some((a) => a.startsWith("*.") && incomingHostname.endsWith(a.slice(1)));
      if (wildcardMatch) return callback(null, true);

      // Allow common hosting previews (Render, Netlify, Vercel)
      if (
        incomingHostname.endsWith(".render.com") ||
        incomingHostname.endsWith(".netlify.app") ||
        incomingHostname.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      // Allow same-origin when server and swagger are on same host (SITE_URL env may be set)
      const siteUrl = (process.env.SITE_URL || process.env.BACKEND_URL || process.env.HOSTNAME || "").trim();
      if (siteUrl) {
        try {
          const u = new URL(siteUrl.match(/^https?:\/\//) ? siteUrl : `https://${siteUrl}`);
          const siteOrigin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`.toLowerCase();
          if (incomingOrigin.startsWith(siteOrigin)) return callback(null, true);
        } catch (e) {}
      }

      // In non-production environments you may allow all origins for convenience
      if (process.env.NODE_ENV !== "production" && process.env.CORS_ALLOW_ALL === "true") {
        console.warn(`CORS permissive mode enabled: allowing origin ${origin}`);
        return callback(null, true);
      }

      // Blocked
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 200,
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
