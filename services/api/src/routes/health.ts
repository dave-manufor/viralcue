import { Router, type Router as RouterType } from "express";

export const healthRouter: RouterType = Router();

healthRouter.get("/", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    environment: process.env.NODE_ENV || "development",
  });
});

healthRouter.get("/ready", async (req, res) => {
  try {
    // TODO: Add database connection check
    res.json({
      status: "ready",
      checks: {
        database: "ok",
        // Add more health checks as needed
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      error: "Health check failed",
    });
  }
});
