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

interface AudioSession {
  userId: string;
  sessionId: string;
  startTime: Date;
  audioBuffer: Buffer[];
}

const sessions = new Map<string, AudioSession>();

let audioIO: Server;

export function setupAudioSocket(server: HttpServer): Server {
  audioIO = new Server(server, {
    path: "/socket.io/audio",
    cors: {
      origin: [
        "http://localhost:3000",
        "https://*.viralcue.io",
        "chrome-extension://*",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authentication middleware
  audioIO.use(async (socket, next) => {
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
          `[Audio Socket] User not found for Clerk ID ${clerkId}`
        );
        return next(new Error("User not found"));
      }

      // Attach DB userId to socket
      socket.data.userId = user.id;
      next();
    } catch (error) {
      console.error("[Audio Socket] Auth error:", error);
      next(new Error("Authentication failed"));
    }
  });

  audioIO.on("connection", (socket: Socket) => {
    console.log("🎙️ New audio Socket.IO connection");

    // Initialize session
    const session: AudioSession = {
      userId: socket.data.userId || "anonymous",
      sessionId: crypto.randomUUID(),
      startTime: new Date(),
      audioBuffer: [],
    };
    sessions.set(socket.id, session);

    // Send welcome message
    socket.emit("connected", {
      sessionId: session.sessionId,
    });

    // Handle audio data
    socket.on("audio:data", (data: Buffer) => {
      const currentSession = sessions.get(socket.id);
      if (!currentSession) return;

      // Restrict audio buffer accumulation in-memory (max 100 chunks) to prevent memory exhaustion
      if (currentSession.audioBuffer.length > 100) {
        console.warn(`[Audio Socket] Session ${socket.id} buffer exceeded threshold (${currentSession.audioBuffer.length}), discarding old chunks to prevent OOM`);
        currentSession.audioBuffer = currentSession.audioBuffer.slice(-10);
      }

      // Buffer incoming audio data
      currentSession.audioBuffer.push(data);

      // Process audio chunks (every ~1 second of audio)
      if (currentSession.audioBuffer.length >= 4) {
        const audioChunk = Buffer.concat(currentSession.audioBuffer);
        currentSession.audioBuffer = [];

        // TODO: Send to processing pipeline
        console.log(`📊 Received ${audioChunk.length} bytes of audio`);

        // Simulate draft generation (for testing)
        if (Math.random() < 0.1) {
          socket.emit("draft", {
            id: crypto.randomUUID(),
            type: "TWEET",
            content: "🔥 This is a simulated viral moment draft!",
            confidence: 0.85,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });

    socket.on("disconnect", () => {
      const closedSession = sessions.get(socket.id);
      if (closedSession) {
        const duration =
          (Date.now() - closedSession.startTime.getTime()) / 1000;
        console.log(`👋 Audio session ended after ${duration.toFixed(1)}s`);
        sessions.delete(socket.id);
      }
    });

    socket.on("error", (error: Error) => {
      console.error("Audio Socket error:", error);
      sessions.delete(socket.id);
    });
  });

  console.log("🔌 Audio Socket.IO server ready at /socket.io/audio");

  return audioIO;
}

export function getAudioIO(): Server {
  return audioIO;
}
