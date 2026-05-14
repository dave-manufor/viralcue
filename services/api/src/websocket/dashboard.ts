import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createClerkClient } from "@clerk/backend";

// Initialize Clerk client for token verification
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey:
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

// Dashboard client tracking
interface DashboardClient {
  socket: Socket;
  userId: string;
  connectedAt: Date;
}

const dashboardClients = new Map<string, DashboardClient>();

let io: Server;

/**
 * Setup Socket.IO server for dashboard connections
 */
export function setupDashboardSocket(server: HttpServer): Server {
  io = new Server(server, {
    path: "/socket.io/dashboard",
    cors: {
      origin: ["http://localhost:3000", "https://*.viralcue.io"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      // Verify Clerk JWT token
      const fakeRequest = new Request("http://localhost", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await clerkClient.authenticateRequest(fakeRequest);

      if (!result.isSignedIn) {
        return next(new Error("Invalid or expired token"));
      }

      const { userId: clerkId } = result.toAuth();

      if (!clerkId) {
        return next(new Error("Invalid token"));
      }

      // Look up DB user ID
      const { prisma } = await import("@viralcue/db");
      const user = await prisma.user.findUnique({
        where: { authProviderId: clerkId },
        select: { id: true },
      });

      if (!user) {
        console.error(
          `[Dashboard Socket] User not found for Clerk ID ${clerkId}`
        );
        return next(new Error("User not found"));
      }

      // Attach DB userId to socket
      socket.data.userId = user.id;
      next();
    } catch (error) {
      console.error("[Dashboard Socket] Auth error:", error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId;

    // Remove existing connection for this user
    const existing = dashboardClients.get(userId);
    if (existing) {
      existing.socket.disconnect(true);
    }

    // Store new connection
    const client: DashboardClient = {
      socket,
      userId,
      connectedAt: new Date(),
    };
    dashboardClients.set(userId, client);

    // Join user-specific room
    socket.join(`user:${userId}`);

    console.log(`[Dashboard Socket] User ${userId} connected`);

    // Send connected confirmation
    socket.emit("connected", {
      userId,
      timestamp: new Date().toISOString(),
    });

    // Handle incoming events
    socket.on("draft:action", (data) => {
      console.log(`[Dashboard Socket] Draft action from ${userId}:`, data);
      // Handle approve/reject actions
    });

    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      const current = dashboardClients.get(userId);
      if (current?.socket.id === socket.id) {
        dashboardClients.delete(userId);
      }
      console.log(`[Dashboard Socket] User ${userId} disconnected`);
    });
  });

  return io;
}

/**
 * Get the Socket.IO server instance
 */
export function getIO(): Server {
  return io;
}

/**
 * Send a message to a specific user
 */
export function sendToUser(
  userId: string,
  event: string,
  data: object
): boolean {
  if (!io) return false;
  io.to(`user:${userId}`).emit(event, data);
  return true;
}

/**
 * Push a new draft to user's dashboard
 */
export function pushDraftToUser(userId: string, draft: any) {
  return sendToUser(userId, "draft:new", {
    draft,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Push draft update (e.g., after approval/rejection)
 */
export function pushDraftUpdate(
  userId: string,
  draftId: string,
  status: string
) {
  return sendToUser(userId, "draft:update", {
    draftId,
    status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Push extension status update
 */
export function pushExtensionStatus(
  userId: string,
  status: "IDLE" | "CONNECTING" | "STREAMING" | "ERROR",
  streamId?: string,
  sessionId?: string
) {
  return sendToUser(userId, "extension:status", {
    status,
    streamId,
    sessionId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Push stream status change
 */
export function pushStreamStatus(
  userId: string,
  streamId: string,
  status: "LIVE" | "OFFLINE" | "MONITORING" | "STOPPED"
) {
  return sendToUser(userId, "stream:status", {
    streamId,
    status,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get count of connected clients
 */
export function getConnectedClientCount(): number {
  return dashboardClients.size;
}

/**
 * Check if user is connected
 */
export function isUserConnected(userId: string): boolean {
  return dashboardClients.has(userId);
}
