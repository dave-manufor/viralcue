"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import {
  History,
  Check,
  X,
  ChevronRight,
  FileText,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StreamHistoryItem {
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function StreamHistoryPage() {
  const { getToken } = useAuth();
  const [streams, setStreams] = useState<StreamHistoryItem[]>([]);
  const [retentionHours, setRetentionHours] = useState(24);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStreamHistory() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/stream-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setStreams(data.streams);
          setRetentionHours(data.retentionHours);
        }
      } catch (error) {
        console.error("Failed to fetch stream history:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStreamHistory();
  }, [getToken]);

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
    });
  };

  return (
    <>
      <Header
        title="Stream History"
        description={`Stream drafts are kept for ${retentionHours} hours on your current plan`}
      />

      <div className="p-6 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-zinc-400 border-t-transparent rounded-full" />
          </div>
        ) : streams.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="h-16 w-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                  <History className="w-8 h-8 text-zinc-400" />
                </div>
                <h3 className="text-lg font-medium text-zinc-900 mb-2">
                  No recent streams
                </h3>
                <p className="text-sm text-zinc-500">
                  Complete a monitored stream to see it here
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {streams.map((stream, index) => (
              <motion.div
                key={stream.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/stream-history/${stream.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-4 md:p-6">
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-zinc-900">
                              {stream.channelName || "Unknown Channel"}
                            </h3>
                            {stream.isExpiringSoon && (
                              <Badge
                                variant={
                                  stream.expiresInHours < 1
                                    ? "destructive"
                                    : "warning"
                                }
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {stream.expiresInHours < 1
                                  ? "Expires soon"
                                  : `Expires in ${stream.expiresInHours}h`}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-zinc-500">
                            {formatDate(stream.endedAt)} •{" "}
                            {formatDuration(stream.durationMinutes)}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                      </div>

                      {/* Stats Row */}
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2 text-zinc-500">
                          <FileText className="w-4 h-4" />
                          <span>{stream.draftsGenerated} Generated</span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-600">
                          <Check className="w-4 h-4" />
                          <span>{stream.draftsApproved} Approved</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-600">
                          <X className="w-4 h-4" />
                          <span>{stream.draftsRejected} Rejected</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </>
  );
}
