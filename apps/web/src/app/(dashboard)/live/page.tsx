"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  PanInfo,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  Check,
  X,
  Copy,
  Twitter,
  Clock,
  Radio,
  Wifi,
  WifiOff,
  AlertCircle,
  Play,
  Pause,
} from "lucide-react";
import { useUser, useAuth } from "@clerk/nextjs";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useExtension } from "@/hooks/use-extension";
import { useDashboardSocket } from "@/hooks/use-dashboard-socket";
import { ChannelToggles, getPlatformName } from "@/components/channel-toggles";

interface Draft {
  id: string;
  content: string;
  draftType: "TWEET" | "THREAD" | "SHORT_VIDEO" | "AFFILIATE" | "CHAT_MESSAGE";
  confidenceScore: number;
  createdAt: string;
  affiliateLinkId?: string;
  transcriptSnippet?: string;
  videoUrl?: string;
}

interface Connection {
  provider: string;
  platformUserId: string;
  needsReconnect?: boolean;
}

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 5) return "A couple mins ago";
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  return date.toLocaleDateString();
}

// Connection status component
function ConnectionStatus({
  isWsConnected,
  extension,
  channelName,
  streamTitle,
  onStopMonitoring,
  isStopping,
}: {
  isWsConnected: boolean;
  extension: ReturnType<typeof useExtension>;
  channelName: string | null;
  streamTitle: string | null;
  onStopMonitoring: () => void;
  isStopping: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6 w-full sm:w-auto">
      {/* Active Channel Indicator */}
      {channelName && (
        <>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-red-500 animate-pulse" />
              <span className="text-sm font-medium text-zinc-700">
                Monitoring{" "}
                <span className="text-zinc-900 font-bold">{channelName}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-2 rounded-full hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"
                onClick={onStopMonitoring}
                disabled={isStopping}
                title="Stop Monitoring"
              >
                {isStopping ? (
                  <div className="h-3 w-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            </div>
            {streamTitle && (
              <span
                className="text-xs text-zinc-500 ml-6 max-w-[200px] sm:max-w-[300px] truncate"
                title={streamTitle}
              >
                {streamTitle}
              </span>
            )}
          </div>
          <div className="hidden sm:block h-8 w-px bg-zinc-200" />
        </>
      )}

      {/* WebSocket Status */}
      <div className="flex items-center gap-2">
        {isWsConnected ? (
          <Wifi className="h-4 w-4 text-emerald-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-zinc-400" />
        )}
        <span
          className={cn(
            "text-sm",
            isWsConnected ? "text-emerald-600" : "text-zinc-500"
          )}
        >
          {isWsConnected ? "Connected" : "Connecting..."}
        </span>
      </div>

      <div className="h-4 w-px bg-zinc-200" />

      {/* Extension Status */}
      <div className="flex items-center gap-2">
        {extension.isInstalled ? (
          <>
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                extension.status === "STREAMING"
                  ? "bg-emerald-500 animate-pulse"
                  : extension.status === "CONNECTING"
                    ? "bg-amber-500 animate-pulse"
                    : extension.status === "ERROR"
                      ? "bg-red-500"
                      : "bg-zinc-400"
              )}
            />
            <span className="text-sm text-zinc-600">
              Extension: {extension.status.toLowerCase()}
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-amber-600">
              Extension not detected
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// Swipe card component
function SwipeCard({
  draft,
  onSwipe,
  onApprove,
  onReject,
  isActive,
  index,
  exitDirection,
  enabledChannels,
  connections,
  onToggleChannel,
  onConnectChannel,
}: {
  draft: Draft;
  onSwipe: (direction: "left" | "right") => void;
  onApprove: () => void;
  onReject: () => void;
  isActive: boolean;
  index: number;
  exitDirection: "left" | "right";
  enabledChannels: string[];
  connections: Connection[];
  onToggleChannel: (channel: string) => void;
  onConnectChannel: (channel: string) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(
    x,
    [-200, -100, 0, 100, 200],
    [0.5, 1, 1, 1, 0.5]
  );
  const approveOpacity = useTransform(x, [0, 100], [0, 1]);
  const rejectOpacity = useTransform(x, [-100, 0], [1, 0]);

  // Calculate stagger styles
  const yOffset = -index * 32; // Moves up by 32px per card for more visible stagger
  const scale = 1 - index * 0.05; // Shrinks by 5% per card
  const brightness = 1 - index * 0.05; // Darkens slightly less aggressively
  // Only show first 3 cards, fade out others
  const cardOpacity = index < 3 ? 1 : 0;

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x > 100) {
        onApprove();
        onSwipe("right");
      } else if (info.offset.x < -100) {
        onReject();
        onSwipe("left");
      }
    },
    [onSwipe, onApprove, onReject]
  );

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draft.content);
  };

  const openTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(draft.content)}`;
    window.open(url, "_blank");
  };

  const confidence = draft.confidenceScore ?? 0;
  // Show "CLIP" if video exists, otherwise show draft type
  const isClip = !!draft.videoUrl;
  const typeLabel = isClip
    ? "CLIP"
    : draft.draftType === "CHAT_MESSAGE"
      ? "CHAT"
      : "TWEET";

  // Track time updates
  const [relativeTime, setRelativeTime] = useState(
    formatRelativeTime(draft.createdAt)
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(draft.createdAt));
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [draft.createdAt]);

  // Exit variants for directional animation
  const variants = {
    exit: (direction: "left" | "right") => {
      // If not active (e.g., background card shifting), just fade out without movement
      if (!isActive) {
        return { opacity: 0, transition: { duration: 0.2 } };
      }
      return {
        x: direction === "right" ? 400 : -400,
        opacity: 0,
        transition: { duration: 0.2 },
      };
    },
  };

  return (
    <motion.div
      className="absolute w-full top-0 left-0"
      style={{
        x,
        rotate,
        opacity,
        zIndex: 100 - index,
        pointerEvents: isActive ? "auto" : "none",
        filter: `brightness(${brightness})`,
      }}
      drag={isActive ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={isActive ? handleDragEnd : undefined}
      custom={exitDirection}
      variants={variants}
      initial={{
        scale: index === 0 ? 0.9 : scale, // Slight pop-in for new vs maintain structure
        opacity: 0,
        y: index === 0 ? 50 : yOffset,
      }}
      animate={{
        scale,
        opacity: cardOpacity,
        y: isActive ? 0 : yOffset, // Active card is at 0, others staggered up
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
      }}
      exit="exit"
    >
      {/* Approve/Reject Indicators */}
      <motion.div
        style={{ opacity: approveOpacity }}
        className="absolute -right-4 top-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg"
      >
        <Check className="h-8 w-8 text-white" />
      </motion.div>
      <motion.div
        style={{ opacity: rejectOpacity }}
        className="absolute -left-4 top-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg"
      >
        <X className="h-8 w-8 text-white" />
      </motion.div>

      <Card className="cursor-grab active:cursor-grabbing shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
        {/* Video Preview - only for clips */}
        {draft.videoUrl && (
          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              src={draft.videoUrl}
              className="w-full h-full object-contain"
              onEnded={() => setIsPlaying(false)}
              playsInline
            />
            <button
              onClick={togglePlayPause}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
            >
              <div className="h-16 w-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                {isPlaying ? (
                  <Pause className="h-8 w-8 text-zinc-900" />
                ) : (
                  <Play className="h-8 w-8 text-zinc-900 ml-1" />
                )}
              </div>
            </button>
          </div>
        )}

        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  isClip
                    ? "default"
                    : draft.draftType === "AFFILIATE"
                      ? "warning"
                      : "secondary"
                }
              >
                {typeLabel}
              </Badge>
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {relativeTime}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">Confidence</span>
              <Badge variant={confidence > 0.85 ? "success" : "outline"}>
                {Math.round(confidence * 100)}%
              </Badge>
            </div>
          </div>

          {/* Channel Selection Toggles */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-zinc-500">Post to:</span>
            <ChannelToggles
              draftType={draft.draftType}
              enabledChannels={enabledChannels}
              connections={connections}
              onToggle={onToggleChannel}
              onConnect={onConnectChannel}
            />
          </div>

          {/* Content */}
          <p className="text-lg text-zinc-900 leading-relaxed mb-4">
            {draft.content}
          </p>

          {/* Transcript snippet */}
          {draft.transcriptSnippet && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 mb-4">
              <p className="text-xs text-zinc-500 mb-1">From stream:</p>
              <p className="text-sm text-zinc-600 italic">
                &quot;{draft.transcriptSnippet}&quot;
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={copyToClipboard}
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={openTwitter}
            >
              <Twitter className="h-4 w-4 mr-1.5" />
              Tweet
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Empty state when no drafts
function EmptyState({ isStreaming }: { isStreaming: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute inset-0 flex flex-col items-center justify-center"
    >
      <div
        className={cn(
          "h-16 w-16 rounded-full flex items-center justify-center mb-4",
          isStreaming ? "bg-emerald-50" : "bg-zinc-100"
        )}
      >
        {isStreaming ? (
          <Radio className="h-8 w-8 text-emerald-500 animate-pulse" />
        ) : (
          <Check className="h-8 w-8 text-zinc-400" />
        )}
      </div>
      <p className="text-lg font-medium text-zinc-900">
        {isStreaming ? "Listening for moments..." : "All caught up!"}
      </p>
      <p className="text-sm text-zinc-500 mt-1">
        {isStreaming
          ? "AI is analyzing your stream for viral content"
          : "No pending drafts right now"}
      </p>
    </motion.div>
  );
}

export default function LivePage() {
  const { user: _user } = useUser();
  const extension = useExtension();
  const {
    isConnected,
    pendingDrafts,
    approveDraft,
    rejectDraft,
    extensionStatus,
    pendingAction: _pendingAction,
    undoLastAction,
  } = useDashboardSocket();
  const { getToken } = useAuth();

  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [streamTitle, setStreamTitle] = useState<string | null>(null);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right">("left");

  // Channel selection state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [enabledTextChannels, setEnabledTextChannels] = useState<string[]>([
    "twitter",
    "threads",
  ]);
  const [enabledVideoChannels, setEnabledVideoChannels] = useState<string[]>([
    "instagram",
    "tiktok",
    "youtube",
  ]);

  // Fetch user connections and channel preferences
  useEffect(() => {
    const fetchConnectionsAndSettings = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

        // Fetch connections
        const connRes = await fetch(`${apiUrl}/api/user/connections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (connRes.ok) {
          const data = await connRes.json();
          setConnections(data.connections || []);
        }

        // Fetch settings
        const settingsRes = await fetch(`${apiUrl}/api/user/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.enabledTextChannels) {
            setEnabledTextChannels(settings.enabledTextChannels);
          }
          if (settings.enabledVideoChannels) {
            setEnabledVideoChannels(settings.enabledVideoChannels);
          }
        }
      } catch (err) {
        console.error("Failed to fetch connections/settings:", err);
      }
    };
    fetchConnectionsAndSettings();
  }, [getToken]);

  // Toggle channel and persist
  const handleToggleChannel = useCallback(
    async (channel: string, draftType: string) => {
      const isVideo = draftType === "SHORT_VIDEO";
      const channels = isVideo ? enabledVideoChannels : enabledTextChannels;
      const setChannels = isVideo
        ? setEnabledVideoChannels
        : setEnabledTextChannels;

      let newChannels: string[];
      if (channels.includes(channel)) {
        newChannels = channels.filter((c) => c !== channel);
      } else {
        newChannels = [...channels, channel];
      }
      setChannels(newChannels);

      // Persist to API
      try {
        const token = await getToken();
        if (!token) return;
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/user/settings`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              isVideo
                ? { enabledVideoChannels: newChannels }
                : { enabledTextChannels: newChannels }
            ),
          }
        );
      } catch (err) {
        console.error("Failed to save channel preference:", err);
      }
    },
    [getToken, enabledTextChannels, enabledVideoChannels]
  );

  // Handle connect channel - open OAuth
  const handleConnectChannel = useCallback((channel: string) => {
    const oauthUrl = `/settings?connect=${channel}`;
    window.open(oauthUrl, "_blank");
    toast(
      `Please connect your ${getPlatformName(channel)} account to post there.`,
      {
        icon: "🔗",
        duration: 5000,
      }
    );
  }, []);

  // Fetch active session info
  useEffect(() => {
    const fetchActiveSession = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/streams/active-session`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.activeSession?.channelName) {
            setActiveChannel(data.activeSession.channelName);
            setStreamTitle(data.activeSession.streamTitle || null);
            setActiveStreamId(data.activeSession.streamId);
            // Initialize counts from database
            setApprovedCount(data.activeSession.draftsApproved || 0);
            setRejectedCount(data.activeSession.draftsRejected || 0);
          } else {
            // Reset if no active session
            setActiveChannel(null);
            setStreamTitle(null);
            setActiveStreamId(null);
            setApprovedCount(0);
            setRejectedCount(0);
          }
        }
      } catch (err) {
        console.error("Failed to fetch active session:", err);
      }
    };

    fetchActiveSession();
    // Poll every 30s
    const interval = setInterval(fetchActiveSession, 30000);
    return () => clearInterval(interval);
  }, [getToken]);

  // Persisted counts from database (fetched from API)
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  const handleStopMonitoring = async () => {
    if (!activeStreamId) return;
    setIsStopping(true);

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/streams/${activeStreamId}/deactivate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        // Clear state immediately
        setActiveChannel(null);
        setStreamTitle(null);
        setActiveStreamId(null);
      } else {
        console.error("Failed to stop monitoring");
      }
    } catch (err) {
      console.error("Error stopping monitoring:", err);
    } finally {
      setIsStopping(false);
    }
  };

  // Combine pending drafts from WebSocket
  const drafts = pendingDrafts;
  const isStreaming =
    extension.status === "STREAMING" || extensionStatus === "STREAMING";

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      const currentDraft = drafts[0];
      if (!currentDraft) return;

      setExitDirection(direction);
      // Increment persisted counters
      if (direction === "right") {
        setApprovedCount((c) => c + 1);
      } else {
        setRejectedCount((c) => c + 1);
      }
    },
    [drafts]
  );

  const handleApprove = useCallback(() => {
    const currentDraft = drafts[0];
    if (currentDraft) {
      // Determine which enabled channels to pass based on draft type
      const channelsToSend =
        currentDraft.draftType === "SHORT_VIDEO"
          ? enabledVideoChannels
          : enabledTextChannels;
      approveDraft(currentDraft.id, channelsToSend);
    }
  }, [drafts, approveDraft, enabledTextChannels, enabledVideoChannels]);

  const handleReject = useCallback(() => {
    const currentDraft = drafts[0];
    if (currentDraft) {
      rejectDraft(currentDraft.id);
    }
  }, [drafts, rejectDraft]);

  const [activeAction, setActiveAction] = useState<"approve" | "reject" | null>(
    null
  );

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent multiple swipes if key is held down
      if (e.repeat) return;

      // Undo with Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undoLastAction();
        return;
      }

      if (drafts.length === 0) return;

      if (e.key === "ArrowRight") {
        handleApprove();
        handleSwipe("right");
        setActiveAction("approve");
        setTimeout(() => setActiveAction(null), 200);
      } else if (e.key === "ArrowLeft") {
        handleReject();
        handleSwipe("left");
        setActiveAction("reject");
        setTimeout(() => setActiveAction(null), 200);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drafts.length, handleApprove, handleReject, handleSwipe, undoLastAction]);

  return (
    <>
      <Header
        title="Live Session"
        description="Swipe right to approve, left to reject"
      />

      <div className="p-4 md:p-6 pb-32 flex flex-col items-center">
        {/* Connection Status */}
        <ConnectionStatus
          isWsConnected={isConnected}
          extension={extension}
          channelName={activeChannel}
          streamTitle={streamTitle}
          onStopMonitoring={handleStopMonitoring}
          isStopping={isStopping}
        />

        {/* Expired Token Warning Banner */}
        {connections.some((c) => c.needsReconnect) && (
          <div className="w-full max-w-md mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-orange-500 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" x2="12" y1="9" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
            <p className="text-sm text-orange-800 flex-1">
              {connections
                .filter((c) => c.needsReconnect)
                .map((c) => c.provider)
                .join(", ")}{" "}
              need reconnection to continue posting.
            </p>
            <a
              href="/settings"
              className="text-sm font-medium text-orange-600 hover:text-orange-700 underline"
            >
              Fix in Settings
            </a>
          </div>
        )}

        {/* Stats Bar */}
        <div className="flex items-center gap-6 mb-8 mt-2 md:mt-0">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">
              {approvedCount}
            </p>
            <p className="text-sm text-zinc-500">Approved</p>
          </div>
          <div className="h-8 w-px bg-zinc-200" />
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900">{drafts.length}</p>
            <p className="text-sm text-zinc-500">Pending</p>
          </div>
          <div className="h-8 w-px bg-zinc-200" />
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500">{rejectedCount}</p>
            <p className="text-sm text-zinc-500">Rejected</p>
          </div>
        </div>

        {/* Action Buttons (Moved Above Cards) */}
        <div className="flex flex-col items-center gap-2 mb-8 md:mb-12 z-[200] relative">
          <div className="flex items-center gap-8">
            <button
              onClick={() => {
                handleReject();
                handleSwipe("left");
                setActiveAction("reject");
                setTimeout(() => setActiveAction(null), 200);
              }}
              className={cn(
                "flex items-center justify-center h-14 w-14 rounded-full border-2 border-red-200 text-red-500 transition-all duration-100 bg-transparent",
                "hover:border-red-300 hover:bg-red-50 cursor-pointer outline-none",
                activeAction === "reject" &&
                  "scale-90 bg-red-500 border-red-500 text-white hover:bg-red-600 hover:border-red-600 shadow-sm"
              )}
              aria-label="Reject"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Swipe / Tap
            </div>

            <button
              onClick={() => {
                handleApprove();
                handleSwipe("right");
                setActiveAction("approve");
                setTimeout(() => setActiveAction(null), 200);
              }}
              className={cn(
                "flex items-center justify-center h-14 w-14 rounded-full border-2 border-emerald-200 text-emerald-500 transition-all duration-100 bg-transparent",
                "hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer outline-none",
                activeAction === "approve" &&
                  "scale-90 bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600 shadow-sm"
              )}
              aria-label="Approve"
            >
              <Check className="h-6 w-6" />
            </button>
          </div>

          <div className="hidden md:block text-[10px] text-zinc-400 font-medium">
            Use{" "}
            <span className="font-bold border border-zinc-200 rounded px-1">
              ←
            </span>{" "}
            or{" "}
            <span className="font-bold border border-zinc-200 rounded px-1">
              →
            </span>{" "}
            keys
          </div>
        </div>

        {/* Swipe Area - allow cards to overflow */}
        <div className="relative w-full max-w-md min-h-[60vh] md:min-h-[500px] mt-16 md:mt-24">
          <AnimatePresence initial={false} custom={exitDirection}>
            {drafts.length > 0 ? (
              drafts
                .slice(0, 4)
                .map((draft, index) => (
                  <SwipeCard
                    key={draft.id}
                    draft={draft}
                    index={index}
                    isActive={index === 0}
                    onSwipe={index === 0 ? handleSwipe : () => {}}
                    onApprove={index === 0 ? handleApprove : () => {}}
                    onReject={index === 0 ? handleReject : () => {}}
                    exitDirection={exitDirection}
                    enabledChannels={
                      draft.draftType === "SHORT_VIDEO"
                        ? enabledVideoChannels
                        : enabledTextChannels
                    }
                    connections={connections}
                    onToggleChannel={(channel) =>
                      handleToggleChannel(channel, draft.draftType)
                    }
                    onConnectChannel={handleConnectChannel}
                  />
                ))
            ) : (
              <EmptyState key="empty" isStreaming={isStreaming} />
            )}
          </AnimatePresence>
        </div>

        {/* Extension Install Prompt */}
        {!extension.isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 md:mt-8 p-4 bg-amber-50 border border-amber-100 rounded-lg max-w-md text-center"
          >
            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-amber-800 font-medium mb-1">
              Extension Required
            </p>
            <p className="text-xs text-amber-600">
              Install the ViralCue browser extension to capture your stream
              audio and generate drafts in real-time.
            </p>
          </motion.div>
        )}
      </div>
    </>
  );
}
