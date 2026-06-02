"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Radio,
  Users,
  Clock,
  Play,
  Square,
  Loader2,
  AlertCircle,
  RefreshCw,
  Tv,
  Eye,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@clerk/nextjs";
import { useExtension } from "@/hooks/use-extension";
import { useDashboardSocket } from "@/hooks/use-dashboard-socket";

interface Stream {
  id: string;
  platform: string;
  title: string;
  gameName: string;
  viewerCount: number;
  startedAt: string;
  thumbnailUrl: string;
  isLive: boolean;
  isMonitoring?: boolean;
}

interface ActiveSession {
  sessionId: string;
  streamId: string;
  startedAt: string;
}

interface StreamCardProps {
  stream: Stream;
  activeSession: ActiveSession | null;
  isLoading: boolean;
  onStartMonitoring: (stream: Stream) => void;
  onStopMonitoring: (stream: Stream) => void;
}

function StreamCard({
  stream,
  activeSession,
  isLoading,
  onStartMonitoring,
  onStopMonitoring,
}: StreamCardProps) {
  const isMonitoring = activeSession?.streamId === stream.id;
  const hasOtherActiveSession =
    activeSession && activeSession.streamId !== stream.id;

  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const startTime = new Date(stream.startedAt);
    const updateDuration = () => {
      setDuration(Math.floor((Date.now() - startTime.getTime()) / 1000 / 60));
    };
    updateDuration();
    const interval = setInterval(updateDuration, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [stream.startedAt]);

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card
        className={`overflow-hidden transition-all ${
          isMonitoring
            ? "ring-2 ring-green-500 shadow-lg shadow-green-500/20"
            : hasOtherActiveSession
              ? "opacity-60"
              : "hover:shadow-lg"
        }`}
      >
        <div className="relative">
          {stream.thumbnailUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={stream.thumbnailUrl}
              alt={stream.title}
              className="w-full h-40 object-cover"
            />
          ) : (
            <div className="w-full h-40 bg-zinc-100 flex items-center justify-center">
              <Tv className="h-12 w-12 text-zinc-300" />
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <Badge className="bg-red-500 text-white border-0">
              <span className="w-2 h-2 bg-white rounded-full mr-1.5 animate-pulse" />
              LIVE
            </Badge>
            {isMonitoring && (
              <Badge className="bg-green-500 text-white border-0">
                <Eye className="h-3 w-3 mr-1" />
                MONITORING
              </Badge>
            )}
          </div>
          <div className="absolute bottom-3 right-3">
            {stream.platform === "TWITCH" ? (
              <Badge className="bg-[#9146FF] text-white border-0">Twitch</Badge>
            ) : stream.platform === "KICK" ? (
              <Badge className="bg-[#53FC18] text-black border-0 font-bold">
                Kick
              </Badge>
            ) : null}
          </div>
          <div className="absolute top-3 right-3">
            <Badge
              variant="secondary"
              className="bg-black/50 text-white border-0"
            >
              <Users className="h-3 w-3 mr-1" />
              {stream.viewerCount.toLocaleString()}
            </Badge>
          </div>
        </div>

        <CardContent className="p-4">
          <h3 className="font-semibold text-zinc-900 line-clamp-2 mb-1">
            {stream.title}
          </h3>
          {stream.gameName && (
            <p className="text-sm text-zinc-500 mb-3">{stream.gameName}</p>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm text-zinc-500">
              <Clock className="h-4 w-4 mr-1" />
              {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
            </div>

            {isMonitoring ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStopMonitoring(stream)}
                disabled={isLoading}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-1" />
                    Stop Monitoring
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onStartMonitoring(stream)}
                disabled={isLoading || hasOtherActiveSession}
                className="bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                title={
                  hasOtherActiveSession
                    ? "Stop current session first"
                    : undefined
                }
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Start Monitoring
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <div className="h-16 w-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
        <Radio className="h-8 w-8 text-zinc-400" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">
        No Live Streams
      </h3>
      <p className="text-sm text-zinc-500 max-w-sm">
        Start streaming on Twitch to see your stream here. Make sure you&apos;ve
        connected your Twitch account in Settings.
      </p>
    </motion.div>
  );
}

export default function StreamsPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const extension = useExtension();
  const { lastStreamStatus } = useDashboardSocket();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStreams = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const response = await fetch("http://localhost:3001/api/streams", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch streams");
      }

      const data = await response.json();
      setStreams(data.streams || []);
      setActiveSession(data.activeSession || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load streams");
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  // Handle real-time stream status updates
  useEffect(() => {
    if (!lastStreamStatus) return;

    if (
      lastStreamStatus.status === "STOPPED" &&
      activeSession?.streamId === lastStreamStatus.streamId
    ) {
      setActiveSession(null);
      // Optionally show a toast or notification here
    }
  }, [lastStreamStatus, activeSession]);

  const handleStartMonitoring = async (stream: Stream) => {
    setActionLoading(true);
    setError(null);

    try {
      const token = await getToken();

      const response = await fetch(
        `http://localhost:3001/api/streams/${stream.id}/activate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.code === "SESSION_ALREADY_ACTIVE") {
          // Another session is active - refresh to show current state
          await fetchStreams();
          throw new Error("You already have an active monitoring session");
        }
        throw new Error(data.error || "Failed to activate stream");
      }

      // Update active session
      setActiveSession({
        sessionId: data.sessionId,
        streamId: stream.id,
        startedAt: new Date().toISOString(),
      });

      // Activate extension if installed
      if (extension.isInstalled) {
        await extension.activate({
          streamId: stream.id,
          streamUrl: `https://www.twitch.tv/${stream.id}`,
          token: token || "",
          sessionId: data.sessionId,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start monitoring"
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopMonitoring = async (stream: Stream) => {
    setActionLoading(true);
    setError(null);

    try {
      const token = await getToken();

      const response = await fetch(
        `http://localhost:3001/api/streams/${stream.id}/deactivate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to stop monitoring");
      }

      // Clear active session
      setActiveSession(null);

      // Deactivate extension
      if (extension.isInstalled) {
        await extension.deactivate();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to stop monitoring"
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Header
        title="Your Streams"
        description="Select a stream to start AI-powered content generation"
      />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Active Monitoring Banner */}
        {activeSession && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg p-4 text-white"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">Monitoring Active</p>
                  <p className="text-sm text-white/80">
                    AI is analyzing your stream in real-time
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/live")}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                View Live Dashboard
              </Button>
            </div>
          </motion.div>
        )}

        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3"
          >
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="text-red-600"
            >
              Dismiss
            </Button>
          </motion.div>
        )}

        {/* Refresh Button */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStreams}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Streams Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />
          </div>
        ) : streams.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {streams.map((stream) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                activeSession={activeSession}
                isLoading={actionLoading}
                onStartMonitoring={handleStartMonitoring}
                onStopMonitoring={handleStopMonitoring}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
