"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  X,
  ChevronRight,
  Zap,
  Target,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

// Content categories matching the backend enum
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

// Tone presets matching the backend enum
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

interface ContextOnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  onDismiss: () => void;
}

export function ContextOnboardingModal({
  isOpen,
  onComplete,
  onDismiss,
}: ContextOnboardingModalProps) {
  const authFetch = useAuthFetch();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form state
  const [contentCategory, setContentCategory] = useState("GAMING");
  const [contentCategoryOther, setContentCategoryOther] = useState("");
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [channelDescription, setChannelDescription] = useState("");

  const handleToneToggle = (tone: string) => {
    setSelectedTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // Save context
      await authFetch("/api/user/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentCategory,
          contentCategoryOther:
            contentCategory === "OTHER" ? contentCategoryOther : null,
          tonePresets: selectedTones,
          channelDescription: channelDescription || null,
        }),
      });

      onComplete();
    } catch (error) {
      console.error("Failed to save context:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    setLoading(true);
    try {
      await authFetch("/api/user/settings/dismiss-prompt", {
        method: "POST",
      });
      onDismiss();
    } catch (error) {
      console.error("Failed to dismiss prompt:", error);
      onDismiss();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100 transition-colors z-10"
            disabled={loading}
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>

          {/* Header */}
          <div className="bg-zinc-900 px-6 py-8 text-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/10 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold">Personalize Your AI</h2>
            </div>
            <p className="text-zinc-400 text-sm">
              Help us understand your style for better draft suggestions
            </p>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Benefits */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                    <Zap className="w-5 h-5 text-zinc-900 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-zinc-900">
                        More Accurate Drafts
                      </p>
                      <p className="text-sm text-zinc-600">
                        AI learns your tone and style for posts that sound like
                        you
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                    <Target className="w-5 h-5 text-zinc-900 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-zinc-900">
                        Better Viral Scoring
                      </p>
                      <p className="text-sm text-zinc-600">
                        Moments scored based on what works for YOUR audience
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                    <MessageSquare className="w-5 h-5 text-zinc-900 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-zinc-900">
                        Faster Approvals
                      </p>
                      <p className="text-sm text-zinc-600">
                        Spend less time editing, more time streaming
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleDismiss}
                    disabled={loading}
                  >
                    Skip for now
                  </Button>
                  <Button
                    className="flex-1 bg-zinc-900 hover:bg-zinc-800"
                    onClick={() => setStep(1)}
                    disabled={loading}
                  >
                    Let&apos;s go <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                {/* Content Category */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    What do you stream?
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
                      placeholder="Describe your content..."
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
                    What&apos;s your vibe? (select all that apply)
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

                {/* Channel Description (optional) */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Describe your channel{" "}
                    <span className="text-zinc-400">(optional)</span>
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

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(0)}
                    disabled={loading}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-zinc-900 hover:bg-zinc-800"
                    onClick={handleComplete}
                    disabled={loading || selectedTones.length === 0}
                  >
                    {loading ? "Saving..." : "Complete Setup"}
                  </Button>
                </div>

                <p className="text-xs text-zinc-500 text-center">
                  You can always update this in Settings → AI Personalization
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
