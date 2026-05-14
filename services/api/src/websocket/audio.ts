import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

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

  audioIO.on("connection", (socket: Socket) => {
    console.log("🎙️ New audio Socket.IO connection");

    // Initialize session
    const session: AudioSession = {
      userId: socket.handshake.auth.userId || "anonymous",
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
