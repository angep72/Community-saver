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
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) return callback(null, true);

      const normalize = (entry) => {
        if (!entry) return null;
        entry = entry.trim();
        if (entry.startsWith("*.")) return entry.toLowerCase();
        try {
          const maybe = entry.match(/^https?:\/\//) ? entry : `https://${entry}`;
          const u = new URL(maybe);
          return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`.toLowerCase();
        } catch (e) {
          return entry.toLowerCase();
        }
      };

      // defaults + env-configured lists
      const defaults = [
        "http://localhost:5173",
        "https://lovely-nougat-b6139b.netlify.app",
        "https://communitysaver.netlify.app",
      ];

      const fromEnv = (v) =>
        (v || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

      const envOrigins = [
        ...fromEnv(process.env.CORS_ALLOWED_ORIGINS),
        ...fromEnv(process.env.FRONTEND_URL),
        ...fromEnv(process.env.SWAGGER_UI_URL),
        ...(process.env.BACKEND_URL ? [process.env.BACKEND_URL] : []),
      ];

      const normalizedSet = new Set();
      [...defaults, ...envOrigins].forEach((it) => {
        const n = normalize(it);
        if (n) normalizedSet.add(n);
      });
      const allowed = Array.from(normalizedSet);

      // quick allow: any localhost or 127.0.0.1 (any port)
      try {
        const u = new URL(origin);
        const host = u.hostname.toLowerCase();
        if (host === "localhost" || host === "127.0.0.1") {
          return callback(null, true);
        }
      } catch (e) {
        // continue
      }

      // exact origin match (origin will be echoed by cors when true)
      const incoming = origin.toLowerCase().replace(/\/+$/, "");
      if (allowed.includes(incoming) || allowed.includes(incoming.replace(/\/$/, ""))) {
        return callback(null, true);
      }

      // hostname-only match (allowed may contain hostname without protocol)
      let incomingHost = "";
      try {
        incomingHost = new URL(origin).hostname.toLowerCase();
      } catch (e) {}
      if (allowed.includes(incomingHost)) return callback(null, true);

      // wildcard match support (*.example.com)
      const wildcardOk = allowed.some((a) => a.startsWith("*.") && incomingHost.endsWith(a.slice(1)));
      if (wildcardOk) return callback(null, true);

      // allow common preview hosts
      if (
        incomingHost.endsWith(".render.com") ||
        incomingHost.endsWith(".netlify.app") ||
        incomingHost.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      // allow same-origin when BACKEND_URL matches origin
      const site = (process.env.BACKEND_URL || process.env.SITE_URL || "").trim();
      if (site) {
        try {
          const s = normalize(site);
          if (s && incoming.startsWith(s)) return callback(null, true);
        } catch (e) {}
      }

      // dev helper: allow all if explicitly enabled
      if (process.env.NODE_ENV !== "production" && process.env.CORS_ALLOW_ALL === "true") {
        console.warn(`CORS permissive mode enabled - allowing origin ${origin}`);
        return callback(null, true);
      }

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

// Ensure swagger UI uses the backend URL from env to avoid CORS cross-origin issues
(() => {
  const port = process.env.PORT || 3000;
  const rawBackendUrl = (process.env.BACKEND_URL || `http://localhost:${port}`).trim();
  const normalizedBackendUrl = rawBackendUrl.replace(/\/+$/, "");

  try {
    if (swaggerSpecs && typeof swaggerSpecs === "object") {
      // determine whether the spec paths include /api prefix
      const paths = swaggerSpecs.paths || {};
      const pathKeys = Object.keys(paths);
      const hasApiPrefixedPath = pathKeys.some((p) => p.startsWith("/api/"));

      // target server URL: if spec paths are NOT prefixed with /api, append /api so Swagger requests hit /api/* routes
      const serverUrl = hasApiPrefixedPath ? normalizedBackendUrl : `${normalizedBackendUrl}/api`;

      // set OpenAPI v3 servers
      if (!swaggerSpecs.servers) {
        swaggerSpecs.servers = [{ url: serverUrl }];
      } else {
        swaggerSpecs.servers[0] = { url: serverUrl };
      }

      // Backwards-compatibility for Swagger 2.0 (host/basePath)
      if (!swaggerSpecs.host) {
        try {
          const u = new URL(serverUrl);
          swaggerSpecs.host = u.host; // hostname:port
          // set basePath only when spec paths are not already prefixed with /api
          swaggerSpecs.basePath = hasApiPrefixedPath ? (u.pathname === "/" ? "" : u.pathname) : `${u.pathname.replace(/\/+$/, "") || ""}/api`;
        } catch (e) {
          // ignore parse errors
        }
      }
    }
    console.info("Swagger server URL set to:", swaggerSpecs.servers && swaggerSpecs.servers[0] && swaggerSpecs.servers[0].url);
  } catch (e) {
    console.warn("Failed to normalize/set swagger server URL:", e.message || e);
  }
})();

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
