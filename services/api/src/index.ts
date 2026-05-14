import "dotenv/config";
import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { createServer } from "http";

import { errorHandler } from "./middleware/error-handler";
import {
  globalLimiter,
  authLimiter,
  sensitiveOpLimiter,
} from "./middleware/rate-limit";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { userRouter } from "./routes/user";
import { sessionsRouter } from "./routes/sessions";
import { draftsRouter } from "./routes/drafts";
import { affiliateLinksRouter } from "./routes/affiliate-links";
import { streamsRouter } from "./routes/streams";
import { streamHistoryRouter } from "./routes/stream-history";
import { internalRouter } from "./routes/internal";
import { setupAudioSocket } from "./websocket/audio";
import { setupDashboardSocket } from "./websocket/dashboard";

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Apply global rate limit to all routes
app.use(globalLimiter);

import { kickAuthRouter } from "./routes/kick-auth";

// Public API Routes
app.use("/api/health", healthRouter);
app.use("/api/auth/kick", authLimiter, kickAuthRouter);
app.use("/api/auth", authLimiter, authRouter); // Auth gets stricter limits
app.use("/api/user", userRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/drafts", draftsRouter);
app.use("/api/affiliate-links", affiliateLinksRouter);
app.use("/api/streams", streamsRouter); // Specific limits applied inside router
app.use("/api/stream-history", streamHistoryRouter);

// Internal API (for AI engine, audio processor)
app.use("/internal", internalRouter);

// Error handling
app.use(errorHandler);

// Create HTTP server and attach Socket.IO
const server = createServer(app);
setupAudioSocket(server); // Socket.IO at /socket.io/audio
setupDashboardSocket(server); // Socket.IO at /socket.io/dashboard

// Start drafts consumer (SQS or Pub/Sub based on config)
const USE_GCP_PUBSUB = process.env.USE_GCP_PUBSUB === "true";
console.log(`[Config] USE_GCP_PUBSUB = ${USE_GCP_PUBSUB}`);

if (USE_GCP_PUBSUB) {
  // Use Pub/Sub consumer
  import("./lib/pubsub-consumer").then(({ startDraftsConsumer }) => {
    startDraftsConsumer();
  });
} else if (process.env.ENABLE_SQS_CONSUMER === "true") {
  // Legacy SQS consumer
  import("./lib/sqs-consumer").then(({ startDraftsConsumer }) => {
    startDraftsConsumer();
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📚 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎙️ Audio Socket.IO: http://localhost:${PORT}/socket.io/audio`);
  console.log(
    `📊 Dashboard Socket.IO: http://localhost:${PORT}/socket.io/dashboard`
  );
});

export default app;
