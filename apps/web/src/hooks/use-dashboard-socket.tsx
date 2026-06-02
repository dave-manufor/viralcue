"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { io, Socket } from "socket.io-client";
import toast from "react-hot-toast";

// Message types from server
interface Draft {
  id: string;
  content: string;
  draftType: "TWEET" | "THREAD" | "SHORT_VIDEO" | "AFFILIATE" | "CHAT_MESSAGE";
  confidenceScore: number;
  transcriptSnippet?: string;
  videoUrl?: string;
  affiliateLinkId?: string;
  createdAt: string;
}

interface ExtensionStatus {
  status: "IDLE" | "CONNECTING" | "STREAMING" | "ERROR";
  streamId?: string;
  sessionId?: string;
  timestamp: string;
}

interface PendingAction {
  draftId: string;
  action: "approve" | "reject";
  draft: Draft;
  timeoutId: ReturnType<typeof setTimeout>;
  expiresAt: number;
  enabledChannels?: string[];
}

interface UseDashboardSocketReturn {
  isConnected: boolean;
  pendingDrafts: Draft[];
  extensionStatus: ExtensionStatus["status"] | null;
  activeStreamId: string | null;
  activeSessionId: string | null;
  lastStreamStatus: { streamId: string; status: string } | null;
  pendingAction: PendingAction | null;
  approveDraft: (draftId: string, enabledChannels?: string[]) => void;
  rejectDraft: (draftId: string) => void;
  undoLastAction: () => void;
  clearDraft: (draftId: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const UNDO_DELAY_MS = 2000;

export function useDashboardSocket(): UseDashboardSocketReturn {
  const { getToken, isSignedIn } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<Draft[]>([]);
  const [extensionStatus, setExtensionStatus] = useState<
    ExtensionStatus["status"] | null
  >(null);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastStreamStatus, setLastStreamStatus] = useState<{
    streamId: string;
    status: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );

  // Commit an action to the API (silent - no toast)
  const commitAction = useCallback(
    async (action: PendingAction) => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_URL}/api/drafts/${action.draftId}/action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: action.action,
              ...(action.enabledChannels && {
                enabledChannels: action.enabledChannels,
              }),
            }),
          }
        );

        if (!res.ok) {
          throw new Error("Failed to commit action");
        }
        // Silent success - no toast
      } catch (error) {
        console.error("[Dashboard Socket] Commit failed:", error);
        // Restore draft on failure
        setPendingDrafts((prev) => [action.draft, ...prev]);
      }
    },
    [getToken]
  );

  // Show undo toast with inline button
  const showUndoToast = useCallback(
    (actionType: "approve" | "reject", onUndo: () => void) => {
      toast.custom(
        (t) => (
          <div
            className={`${
              t.visible
                ? "animate-in fade-in slide-in-from-bottom-4"
                : "animate-out fade-out slide-out-to-bottom-4"
            } max-w-sm w-full bg-white shadow-lg rounded-xl pointer-events-auto flex items-center gap-3 px-4 py-3 border border-zinc-200`}
          >
            <div
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                actionType === "approve"
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {actionType === "approve" ? "✓" : "✕"}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-900">
                Draft {actionType === "approve" ? "approved" : "rejected"}
              </p>
            </div>
            <button
              onClick={() => {
                toast.dismiss("undo-toast");
                onUndo();
              }}
              className="px-3 py-1.5 text-sm font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              Undo
            </button>
          </div>
        ),
        { id: "undo-toast", duration: UNDO_DELAY_MS }
      );
    },
    []
  );

  // Show "Action reversed" toast
  const showReversedToast = useCallback(() => {
    toast.custom(
      (t) => (
        <div
          className={`${
            t.visible
              ? "animate-in fade-in slide-in-from-bottom-4"
              : "animate-out fade-out slide-out-to-bottom-4"
          } max-w-sm w-full bg-white shadow-lg rounded-xl pointer-events-auto flex items-center gap-3 px-4 py-3 border border-zinc-200`}
        >
          <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-amber-100 text-amber-600 text-sm">
            ↩
          </div>
          <p className="text-sm font-medium text-zinc-900">Action reversed</p>
        </div>
      ),
      { duration: 2000 }
    );
  }, []);

  // Queue an action with delayed commit
  const queueAction = useCallback(
    (
      draftId: string,
      actionType: "approve" | "reject",
      enabledChannels?: string[]
    ) => {
      const draft = pendingDrafts.find((d) => d.id === draftId);
      if (!draft) return;

      // If there's a pending action, commit it immediately
      if (pendingAction) {
        clearTimeout(pendingAction.timeoutId);
        commitAction(pendingAction);
        toast.dismiss("undo-toast");
      }

      // Optimistically remove from UI
      setPendingDrafts((prev) => prev.filter((d) => d.id !== draftId));

      // Create the action object first so we can reference it in undo
      const timeoutId = setTimeout(() => {
        commitAction({
          draftId,
          action: actionType,
          draft,
          timeoutId,
          expiresAt: Date.now(),
          enabledChannels,
        });
        setPendingAction(null);
        toast.dismiss("undo-toast");
      }, UNDO_DELAY_MS);

      const newAction: PendingAction = {
        draftId,
        action: actionType,
        draft,
        timeoutId,
        expiresAt: Date.now() + UNDO_DELAY_MS,
        enabledChannels,
      };

      setPendingAction(newAction);

      // Show undo toast with callback
      showUndoToast(actionType, () => {
        clearTimeout(newAction.timeoutId);
        setPendingDrafts((prev) => [newAction.draft, ...prev]);
        setPendingAction(null);
        showReversedToast();
      });
    },
    [
      pendingDrafts,
      pendingAction,
      commitAction,
      showUndoToast,
      showReversedToast,
    ]
  );

  const approveDraft = useCallback(
    (draftId: string, enabledChannels?: string[]) => {
      queueAction(draftId, "approve", enabledChannels);
    },
    [queueAction]
  );

  const rejectDraft = useCallback(
    (draftId: string) => {
      queueAction(draftId, "reject");
    },
    [queueAction]
  );

  const undoLastAction = useCallback(() => {
    if (!pendingAction) return;

    // Cancel the timeout
    clearTimeout(pendingAction.timeoutId);

    // Restore draft to UI
    setPendingDrafts((prev) => [pendingAction.draft, ...prev]);

    // Clear pending action
    setPendingAction(null);

    // Dismiss undo toast and show reversed
    toast.dismiss("undo-toast");
    showReversedToast();
  }, [pendingAction, showReversedToast]);

  const connect = useCallback(async () => {
    if (socketRef.current?.connected) return;

    const token = await getToken();
    if (!token) {
      console.log("[Dashboard Socket] No token, skipping connection");
      return;
    }

    console.log("[Dashboard Socket] Connecting with Socket.IO...");

    const socket = io(API_URL, {
      path: "/socket.io/dashboard",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Dashboard Socket] Connected");
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Dashboard Socket] Disconnected:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("[Dashboard Socket] Connection error:", error.message);
      setIsConnected(false);
    });

    socket.on("connected", (data: { userId: string }) => {
      console.log("[Dashboard Socket] Confirmed connected as", data.userId);
    });

    socket.on("draft:new", (data: { draft: Draft }) => {
      setPendingDrafts((prev) => [data.draft, ...prev]);
    });

    socket.on("draft:update", (data: { draftId: string; status: string }) => {
      setPendingDrafts((prev) => prev.filter((d) => d.id !== data.draftId));
    });

    socket.on("extension:status", (data: ExtensionStatus) => {
      setExtensionStatus(data.status);
      setActiveStreamId(data.streamId || null);
      setActiveSessionId(data.sessionId || null);
    });

    socket.on("stream:status", (data: { streamId: string; status: string }) => {
      console.log("[Dashboard Socket] Stream status:", data);
      setLastStreamStatus(data);
    });

    socket.on("pong", () => {
      // Heartbeat response
    });
  }, [getToken]);

  const fetchDrafts = useCallback(
    async (sessionId?: string) => {
      try {
        const token = await getToken();
        if (!token) return;

        const url = sessionId
          ? `${API_URL}/api/drafts?sessionId=${sessionId}`
          : `${API_URL}/api/drafts`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setPendingDrafts(data.drafts);
        }
      } catch (e) {
        console.error("[Dashboard Socket] Failed to fetch drafts", e);
      }
    },
    [getToken]
  );

  useEffect(() => {
    if (isSignedIn) {
      fetchDrafts();
      connect();
    }

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [isSignedIn, connect, fetchDrafts]);

  // Heartbeat
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      socketRef.current?.emit("ping");
    }, 25000);

    return () => clearInterval(pingInterval);
  }, [isConnected]);

  const clearDraft = useCallback((draftId: string) => {
    setPendingDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  return {
    isConnected,
    pendingDrafts,
    extensionStatus,
    activeStreamId,
    activeSessionId,
    lastStreamStatus,
    pendingAction,
    approveDraft,
    rejectDraft,
    undoLastAction,
    clearDraft,
  };
}
