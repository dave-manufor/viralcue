"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowLeft,
  History,
  RotateCcw,
  Check,
  Loader2,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import Link from "next/link";

const CONTENT_CATEGORIES = [
  { value: "GAMING", label: "Gaming" },
  { value: "IRL", label: "IRL" },
  { value: "MUSIC", label: "Music" },
  { value: "ART", label: "Art" },
  { value: "JUST_CHATTING", label: "Just Chatting" },
  { value: "SPORTS", label: "Sports" },
  { value: "EDUCATION", label: "Education" },
  { value: "OTHER", label: "Other" },
];

const TONE_PRESETS = [
  { value: "FUNNY", label: "Funny", emoji: "😂" },
  { value: "PROFESSIONAL", label: "Professional", emoji: "💼" },
  { value: "CASUAL", label: "Casual", emoji: "😎" },
  { value: "EDGY", label: "Edgy", emoji: "🔥" },
  { value: "WHOLESOME", label: "Wholesome", emoji: "💖" },
  { value: "HYPE", label: "Hype", emoji: "🚀" },
  { value: "CHILL", label: "Chill", emoji: "✌️" },
  { value: "SARCASTIC", label: "Sarcastic", emoji: "😏" },
];

interface ContextVersion {
  id: string;
  version: number;
  isActive: boolean;
  contentCategory: string;
  contentCategoryOther: string | null;
  tonePresets: string[];
  channelDescription: string | null;
  targetAudience: string | null;
  avoidTopics: string[];

  createdAt: string;
}

export default function AIContextPage() {
  const authFetch = useAuthFetch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<ContextVersion[]>([]);

  // Form state
  const [contentCategory, setContentCategory] = useState("GAMING");
  const [contentCategoryOther, setContentCategoryOther] = useState("");
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [channelDescription, setChannelDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [avoidTopics, setAvoidTopics] = useState("");

  const fetchContext = useCallback(async () => {
    try {
      const response = await authFetch("/api/user/settings");
      if (response.ok) {
        const data = await response.json();
        if (data.activeContext) {
          const ctx = data.activeContext;
          setContentCategory(ctx.contentCategory || "OTHER");
          setContentCategoryOther(ctx.contentCategoryOther || "");
          setSelectedTones(ctx.tonePresets || []);
          setChannelDescription(ctx.channelDescription || "");
          setTargetAudience(ctx.targetAudience || "");
          setAvoidTopics((ctx.avoidTopics || []).join(", "));
        }
      }
    } catch (error) {
      console.error("Failed to fetch context:", error);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const fetchVersions = useCallback(async () => {
    try {
      const response = await authFetch("/api/user/context/versions");
      if (response.ok) {
        const data = await response.json();
        setVersions(data.versions || []);
      }
    } catch (error) {
      console.error("Failed to fetch versions:", error);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    if (showVersions) {
      fetchVersions();
    }
  }, [showVersions, fetchVersions]);

  const handleToneToggle = (tone: string) => {
    setSelectedTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await authFetch("/api/user/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentCategory,
          contentCategoryOther:
            contentCategory === "OTHER" ? contentCategoryOther : null,
          tonePresets: selectedTones,
          channelDescription: channelDescription || null,
          targetAudience: targetAudience || null,
          avoidTopics: avoidTopics
            ? avoidTopics
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
        }),
      });

      if (response.ok) {
        fetchVersions();
      }
    } catch (error) {
      console.error("Failed to save context:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (version: number) => {
    try {
      const response = await authFetch(
        `/api/user/context/rollback/${version}`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        fetchContext();
        fetchVersions();
        setShowVersions(false);
      }
    } catch (error) {
      console.error("Failed to rollback:", error);
    }
  };

  if (loading) {
    return (
      <>
        <Header title="AI Personalization" />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="AI Personalization" />

      <div className="p-6 max-w-3xl">
        {/* Back Link */}
        <Link
          href="/settings"
          className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Settings
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-zinc-900 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl">AI Context</CardTitle>
                  <CardDescription>
                    Help your AI understand your style for better drafts
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVersions(!showVersions)}
                >
                  <History className="w-4 h-4 mr-2" />
                  Version History
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Version History Dropdown */}
          {showVersions && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Version History</CardTitle>
                  <CardDescription>
                    Rollback to a previous context configuration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {versions.length === 0 ? (
                    <p className="text-sm text-zinc-500">No versions yet</p>
                  ) : (
                    versions.map((v) => (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          v.isActive
                            ? "border-zinc-200 bg-zinc-50"
                            : "border-zinc-100"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              Version {v.version}
                            </span>
                            {v.isActive && (
                              <Badge variant="success">Active</Badge>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {new Date(v.createdAt).toLocaleDateString()} •{" "}
                            {v.tonePresets.join(", ") || "No tones set"}
                          </p>
                        </div>
                        {!v.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRollback(v.version)}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Form */}
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Content Category */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Content Category
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {CONTENT_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setContentCategory(cat.value)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                        contentCategory === cat.value
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                {contentCategory === "OTHER" && (
                  <input
                    type="text"
                    placeholder="Describe your content type..."
                    value={contentCategoryOther}
                    onChange={(e) => setContentCategoryOther(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    maxLength={100}
                  />
                )}
              </div>

              {/* Tone Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Tone & Style
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TONE_PRESETS.map((tone) => (
                    <button
                      key={tone.value}
                      onClick={() => handleToneToggle(tone.value)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                        selectedTones.includes(tone.value)
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                      }`}
                    >
                      {tone.emoji} {tone.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Channel Description
                </label>
                <textarea
                  placeholder="e.g., I'm a variety streamer who loves interacting with chat..."
                  value={channelDescription}
                  onChange={(e) => setChannelDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-zinc-400 mt-1 text-right">
                  {channelDescription.length}/500
                </p>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Target Audience
                </label>
                <input
                  type="text"
                  placeholder="e.g., 18-35, gamers, casual viewers"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  maxLength={200}
                />
              </div>

              {/* Avoid Topics */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Topics to Avoid (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g., politics, controversial topics"
                  value={avoidTopics}
                  onChange={(e) => setAvoidTopics(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800"
                  onClick={handleSave}
                  disabled={saving || selectedTones.length === 0}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Save Context
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
