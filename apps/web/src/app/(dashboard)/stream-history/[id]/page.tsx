"use client";

import { useState, useEffect, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  PanInfo,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, X, FileText, AlertTriangle, Tv } from "lucide-react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StreamDetail {
  id: string;
  platform: string;
  channelName: string | null;
  streamTitle: string | null;
  startedAt: string;
  endedAt: string;
  durationMinutes: number | null;
  draftsGenerated: number;
  draftsApproved: number;
  draftsRejected: number;
  expiresAt: string;
  isExpiringSoon: boolean;
  expiresInHours: number;
}

interface Draft {
  id: string;
  content: string;
  draftType: "TWEET" | "THREAD" | "SHORT_VIDEO" | "AFFILIATE" | "CHAT_MESSAGE";
  confidenceScore: number | null;
  status: string;
  videoUrl: string | null;
  transcriptSnippet: string | null;
  createdAt: string;
  actionedAt: string | null;
}

type TabType = "PENDING" | "APPROVED" | "REJECTED";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const UNDO_DELAY_MS = 2000;

interface PendingAction {
  draftId: string;
  action: "approve" | "reject";
  draft: Draft;
  timeoutId: ReturnType<typeof setTimeout>;
}

export default function StreamDetailPage() {
  const { getToken } = useAuth();
  const params = useParams();
  const router = useRouter();
  const streamId = params.id as string;

  const [stream, setStream] = useState<StreamDetail | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("PENDING");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );

  const fetchStream = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/stream-history/${streamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStream(data.stream);
      }
    } catch (error) {
      console.error("Failed to fetch stream:", error);
    }
  }, [getToken, streamId]);

  const fetchDrafts = useCallback(
    async (status?: string) => {
      try {
        const token = await getToken();
        const url = status
          ? `${API_URL}/api/stream-history/${streamId}/drafts?status=${status}`
          : `${API_URL}/api/stream-history/${streamId}/drafts`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setDrafts(data.drafts);
        }
      } catch (error) {
        console.error("Failed to fetch drafts:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [getToken, streamId]
  );

  useEffect(() => {
    fetchStream();
  }, [fetchStream]);

  useEffect(() => {
    fetchDrafts(activeTab);
  }, [fetchDrafts, activeTab]);

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
            body: JSON.stringify({ action: action.action }),
          }
        );

        if (!res.ok) throw new Error("Failed");
        fetchStream();
      } catch (error) {
        console.error("Commit failed:", error);
        toast.error("Failed to save action");
        setDrafts((prev) => [action.draft, ...prev]);
      }
    },
    [getToken, fetchStream]
  );

  const handleAction = useCallback(
    (draftId: string, actionType: "approve" | "reject") => {
      const draft = drafts.find((d) => d.id === draftId);
      if (!draft) return;

      if (pendingAction) {
        clearTimeout(pendingAction.timeoutId);
        commitAction(pendingAction);
        toast.dismiss("undo-toast");
      }

      setDrafts((prev) => prev.filter((d) => d.id !== draftId));

      const timeoutId = setTimeout(() => {
        commitAction({ draftId, action: actionType, draft, timeoutId });
        setPendingAction(null);
        toast.dismiss("undo-toast");
      }, UNDO_DELAY_MS);

      const newAction = { draftId, action: actionType, draft, timeoutId };
      setPendingAction(newAction);

      // Custom toast with inline undo button (matches live page)
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
                clearTimeout(newAction.timeoutId);
                setDrafts((prev) => [newAction.draft, ...prev]);
                setPendingAction(null);
                // Show reversed toast
                toast.custom(
                  (t2) => (
                    <div
                      className={`${
                        t2.visible
                          ? "animate-in fade-in slide-in-from-bottom-4"
                          : "animate-out fade-out slide-out-to-bottom-4"
                      } max-w-sm w-full bg-white shadow-lg rounded-xl pointer-events-auto flex items-center gap-3 px-4 py-3 border border-zinc-200`}
                    >
                      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-amber-100 text-amber-600 text-sm">
                        ↩
                      </div>
                      <p className="text-sm font-medium text-zinc-900">
                        Action reversed
                      </p>
                    </div>
                  ),
                  { duration: 2000 }
                );
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
    [drafts, pendingAction, commitAction]
  );

  const undoLastAction = useCallback(() => {
    if (!pendingAction) return;
    clearTimeout(pendingAction.timeoutId);
    setDrafts((prev) => [pendingAction.draft, ...prev]);
    setPendingAction(null);
    toast.dismiss("undo-toast");
    // Show reversed toast
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
  }, [pendingAction]);

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "Unknown";
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading || !stream) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-zinc-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <Header
        title={stream.channelName || "Stream Details"}
        description={`${formatDate(stream.endedAt)} • ${formatDuration(stream.durationMinutes)}`}
      />

      <div className="p-6 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Stream History
        </Button>

        {/* Stream Info Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center">
                  <Tv className="w-6 h-6 text-zinc-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">
                    {stream.channelName || "Unknown Channel"}
                  </h2>
                  <p className="text-sm text-zinc-500">{stream.platform}</p>
                </div>
              </div>

              {stream.isExpiringSoon && (
                <Badge
                  variant={
                    stream.expiresInHours < 1 ? "destructive" : "warning"
                  }
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {stream.expiresInHours < 1
                    ? "Expires soon"
                    : `Expires in ${stream.expiresInHours}h`}
                </Badge>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-zinc-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-zinc-900">
                  {stream.draftsGenerated}
                </div>
                <div className="text-xs text-zinc-500">Generated</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">
                  {stream.draftsApproved}
                </div>
                <div className="text-xs text-zinc-500">Approved</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {stream.draftsRejected}
                </div>
                <div className="text-xs text-zinc-500">Rejected</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-200 pb-2">
          {(["PENDING", "APPROVED", "REJECTED"] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Drafts */}
        {drafts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-zinc-300 mb-3" />
              <p className="text-zinc-500">
                No {activeTab.toLowerCase()} drafts
              </p>
            </CardContent>
          </Card>
        ) : activeTab === "PENDING" ? (
          <SwipeCardStack
            drafts={drafts}
            onApprove={(id) => handleAction(id, "approve")}
            onReject={(id) => handleAction(id, "reject")}
            pendingAction={pendingAction}
            onUndo={undoLastAction}
          />
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <Card key={draft.id}>
                <CardContent className="p-4">
                  <p className="text-zinc-900 mb-2">{draft.content}</p>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <Badge variant="secondary">{draft.draftType}</Badge>
                    <span>
                      {new Date(draft.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Swipe Card Stack Component
function SwipeCardStack({
  drafts,
  onApprove,
  onReject,
  pendingAction,
  onUndo,
}: {
  drafts: Draft[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  pendingAction: PendingAction | null;
  onUndo: () => void;
}) {
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(
    null
  );

  const handleSwipe = useCallback(
    (draftId: string, direction: "left" | "right") => {
      setExitDirection(direction);
      if (direction === "right") {
        onApprove(draftId);
      } else {
        onReject(draftId);
      }
      setTimeout(() => setExitDirection(null), 300);
    },
    [onApprove, onReject]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      // Undo with Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        onUndo();
        return;
      }

      if (drafts.length === 0) return;

      const currentDraft = drafts[0];
      if (e.key === "ArrowRight") {
        handleSwipe(currentDraft.id, "right");
      } else if (e.key === "ArrowLeft") {
        handleSwipe(currentDraft.id, "left");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drafts, handleSwipe, onUndo]);

  return (
    <div className="relative min-h-[400px] flex flex-col items-center">
      {/* Action Buttons */}
      <div className="flex items-center gap-8 mb-4">
        <button
          onClick={() => drafts[0] && handleSwipe(drafts[0].id, "left")}
          className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors"
        >
          <X className="w-6 h-6 text-red-500" />
        </button>
        <div className="text-center">
          <div className="text-xs text-zinc-400 uppercase tracking-wider">
            Swipe / Tap
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600 font-mono">
              ←
            </kbd>{" "}
            <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600 font-mono">
              →
            </kbd>{" "}
            to decide,{" "}
            <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600 font-mono">
              ⌘Z
            </kbd>{" "}
            to undo
          </div>
        </div>
        <button
          onClick={() => drafts[0] && handleSwipe(drafts[0].id, "right")}
          className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-colors"
        >
          <Check className="w-6 h-6 text-emerald-500" />
        </button>
      </div>

      {/* Undo button */}
      {pendingAction && (
        <Button
          variant="outline"
          onClick={onUndo}
          className="absolute bottom-4 text-amber-600 border-amber-300"
        >
          Undo
        </Button>
      )}

      {/* Card Stack */}
      <div className="relative w-full max-w-md h-[350px]">
        <AnimatePresence>
          {drafts.slice(0, 3).map((draft, index) => (
            <SwipeCard
              key={draft.id}
              draft={draft}
              index={index}
              isActive={index === 0}
              onSwipe={(dir) => handleSwipe(draft.id, dir)}
              exitDirection={index === 0 ? exitDirection : null}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SwipeCard({
  draft,
  index,
  isActive,
  onSwipe,
  exitDirection,
}: {
  draft: Draft;
  index: number;
  isActive: boolean;
  onSwipe: (direction: "left" | "right") => void;
  exitDirection: "left" | "right" | null;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(
    x,
    [-200, -100, 0, 100, 200],
    [0.5, 1, 1, 1, 0.5]
  );

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (Math.abs(info.offset.x) > 100) {
      onSwipe(info.offset.x > 0 ? "right" : "left");
    }
  };

  return (
    <motion.div
      className="absolute top-0 left-0 right-0"
      style={{
        x: isActive ? x : 0,
        rotate: isActive ? rotate : 0,
        opacity: isActive ? opacity : 1 - index * 0.1,
        scale: 1 - index * 0.05,
        zIndex: 100 - index,
      }}
      drag={isActive ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      initial={{ opacity: 0, y: 50 }}
      animate={{
        opacity: 1 - index * 0.1,
        y: index * 8,
        scale: 1 - index * 0.05,
      }}
      exit={{
        x:
          exitDirection === "right" ? 400 : exitDirection === "left" ? -400 : 0,
        opacity: 0,
        transition: { duration: 0.2 },
      }}
    >
      <Card className="shadow-lg">
        <CardContent className="p-6">
          <div className="mb-4">
            <Badge variant="secondary">{draft.draftType}</Badge>
          </div>
          <p className="text-lg text-zinc-900">{draft.content}</p>
          {draft.transcriptSnippet && (
            <div className="mt-4 p-3 bg-zinc-50 rounded-lg">
              <p className="text-xs text-zinc-500 mb-1">Context:</p>
              <p className="text-sm text-zinc-600 italic">
                &quot;{draft.transcriptSnippet}&quot;
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
