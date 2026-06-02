"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Link2,
  Zap,
  Loader2,
  Share2,
  AlertCircle,
  CheckCircle,
  X,
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

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

interface Connection {
  provider: string;
  platformUsername: string;
  connectedAt: string;
  needsReconnect?: boolean;
}

interface UserData {
  id: string;
  email: string;
  username: string;
  connections: Connection[];
}

interface ActiveContext {
  version: number;
  contentCategory: string;
  contentCategoryOther?: string;
  tonePresets: string[];
}

function ConnectionRow({
  provider: _provider,
  label,
  icon,
  color,
  connection,
  loading,
  disconnecting,
  onConnect,
  onDisconnect,
}: {
  provider: string;
  label: string;
  icon: React.ReactNode | string;
  color: string;
  connection?: Connection;
  loading: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 border border-zinc-200 rounded-lg">
      <div className="flex items-center gap-3">
        <div
          className={`h-8 w-8 rounded ${color} flex items-center justify-center text-white font-bold text-sm shrink-0`}
        >
          {icon}
        </div>
        <div>
          <p className="font-medium text-zinc-900">{label}</p>
          <p className="text-sm text-zinc-500">
            {loading
              ? "Loading..."
              : connection
                ? connection.platformUsername
                : "Not connected"}
          </p>
        </div>
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : connection ? (
        connection.needsReconnect ? (
          // Expired/needs reconnect state
          <div className="flex items-center gap-2">
            <Badge
              variant="destructive"
              className="bg-orange-500 hover:bg-orange-600"
            >
              Expired
            </Badge>
            <Button variant="outline" size="sm" onClick={onConnect}>
              Reconnect
            </Button>
          </div>
        ) : (
          // Connected state
          <div className="flex items-center gap-2">
            <Badge variant="success">Connected</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? "..." : "Disconnect"}
            </Button>
          </div>
        )
      ) : (
        <Button variant="outline" size="sm" onClick={onConnect}>
          Connect
        </Button>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const authFetch = useAuthFetch();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [includeStreamLink, setIncludeStreamLink] = useState(true);
  const [autoSendAffiliate, setAutoSendAffiliate] = useState(true);
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(
    null
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState(false);

  // Get connection status from URL params (after OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("error");
    const success = params.get("success");

    // Auto-enable channel on successful OAuth connection
    if (success?.endsWith("_connected")) {
      setConnectionSuccess(true);
      setTimeout(() => setConnectionSuccess(false), 5000);
      window.history.replaceState({}, "", "/settings");

      // Extract provider from success param (e.g., "twitter_connected" -> "twitter")
      const provider = success.replace("_connected", "").toLowerCase();

      // Define which channels are text vs video
      const textChannels = ["twitter", "threads"];
      const videoChannels = ["tiktok", "instagram", "youtube"];

      // Auto-enable the channel in user settings
      const autoEnableChannel = async () => {
        try {
          // Fetch current settings
          const settingsRes = await authFetch("/api/user/settings");
          if (!settingsRes.ok) return;

          const settings = await settingsRes.json();
          const currentTextChannels: string[] =
            settings.enabledTextChannels || ["twitter", "threads"];
          const currentVideoChannels: string[] =
            settings.enabledVideoChannels || ["tiktok", "instagram", "youtube"];

          let updatedTextChannels = currentTextChannels;
          let updatedVideoChannels = currentVideoChannels;

          // Add to appropriate list if not already there
          if (
            textChannels.includes(provider) &&
            !currentTextChannels.includes(provider)
          ) {
            updatedTextChannels = [...currentTextChannels, provider];
          } else if (
            videoChannels.includes(provider) &&
            !currentVideoChannels.includes(provider)
          ) {
            updatedVideoChannels = [...currentVideoChannels, provider];
          }

          // Save updated settings if changed
          if (
            updatedTextChannels !== currentTextChannels ||
            updatedVideoChannels !== currentVideoChannels
          ) {
            await authFetch("/api/user/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                enabledTextChannels: updatedTextChannels,
                enabledVideoChannels: updatedVideoChannels,
              }),
            });
            console.log(`[Settings] Auto-enabled ${provider} channel`);
          }
        } catch (error) {
          console.error("[Settings] Failed to auto-enable channel:", error);
        }
      };

      autoEnableChannel();
    }

    if (errorCode) {
      const errorMessages: Record<string, string> = {
        account_already_connected:
          "This account is already connected to another ViralCue user. Please use a different account or contact support.",
        oauth_denied:
          "You denied the connection request. Please try again if this was a mistake.",
        missing_params:
          "Something went wrong during the connection process. Please try again.",
        invalid_state:
          "The connection session expired. Please try connecting again.",
        connection_failed:
          "Failed to connect your account. Please try again later.",
      };
      setConnectionError(
        errorMessages[errorCode] ||
          "An unexpected error occurred. Please try again."
      );
      window.history.replaceState({}, "", "/settings");
    }
  }, [authFetch]);

  const getConnection = (provider: string) =>
    user?.connections?.find((c) => c.provider === provider);

  const handleConnect = async (provider: string) => {
    try {
      if (provider === "KICK") {
        // Step 1: Request a secure one-time ticket
        const ticketResponse = await authFetch("/api/auth/kick/ticket", {
          method: "POST",
        });

        if (ticketResponse.ok) {
          const { ticket } = await ticketResponse.json();
          // Step 2: Use ticket for insecure context (URL)
          window.location.href = `http://localhost:3001/api/auth/kick/login?ticket=${ticket}`;
        } else {
          console.error("Failed to generate auth ticket");
        }
        return;
      }

      const url = `/api/auth/connect/${provider.toLowerCase()}/url`;

      const response = await authFetch(url);
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.url;
      } else {
        console.error("Failed to get connect URL");
      }
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setDisconnecting(true);
    try {
      const response = await authFetch(
        `/api/auth/disconnect/${provider.toLowerCase()}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                connections: prev.connections.filter(
                  (c) => c.provider !== provider
                ),
              }
            : null
        );
      }
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setDisconnecting(false);
    }
  };

  // Fetch user data
  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await authFetch("/api/auth/me");
        if (response.ok) {
          const data = await response.json();
          setUser(data);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [authFetch]);

  // Fetch user settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await authFetch("/api/user/settings");
        if (response.ok) {
          const data = await response.json();
          setIncludeStreamLink(data.includeStreamLinkInPosts);
          setAutoSendAffiliate(data.autoSendAffiliateLinks ?? true);
          setActiveContext(data.activeContext);
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      }
    }
    fetchSettings();
  }, [authFetch]);

  const handleToggleStreamLink = useCallback(async () => {
    const newValue = !includeStreamLink;
    setIncludeStreamLink(newValue);
    setSavingSettings(true);
    try {
      await authFetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeStreamLinkInPosts: newValue }),
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      setIncludeStreamLink(!newValue); // Revert on error
    } finally {
      setSavingSettings(false);
    }
  }, [authFetch, includeStreamLink]);

  const handleToggleAutoSendAffiliate = useCallback(async () => {
    const newValue = !autoSendAffiliate;
    setAutoSendAffiliate(newValue);
    setSavingSettings(true);
    try {
      await authFetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSendAffiliateLinks: newValue }),
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
      setAutoSendAffiliate(!newValue); // Revert on error
    } finally {
      setSavingSettings(false);
    }
  }, [authFetch, autoSendAffiliate]);

  return (
    <>
      <Header title="Settings" />

      <div className="p-6 max-w-4xl">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {/* Connection Error Alert */}
          {connectionError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">
                  Connection Failed
                </p>
                <p className="text-sm text-red-600 mt-1">{connectionError}</p>
              </div>
              <button
                onClick={() => setConnectionError(null)}
                className="text-red-400 hover:text-red-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* Connection Success Alert */}
          {connectionSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3"
            >
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800">
                  Account Connected
                </p>
                <p className="text-sm text-emerald-600 mt-1">
                  Your account has been successfully connected.
                </p>
              </div>
            </motion.div>
          )}

          {/* Connected Accounts */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-zinc-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      Connected Accounts
                    </CardTitle>
                    <CardDescription>
                      Link your streaming accounts to enable monitoring
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Twitch */}
                <ConnectionRow
                  provider="TWITCH"
                  label="Twitch"
                  icon="T"
                  color="bg-purple-600"
                  connection={getConnection("TWITCH")}
                  loading={loading}
                  disconnecting={disconnecting}
                  onConnect={() => handleConnect("TWITCH")}
                  onDisconnect={() => handleDisconnect("TWITCH")}
                />

                {/* Kick */}
                <ConnectionRow
                  provider="KICK"
                  label="Kick"
                  icon="K"
                  color="bg-green-500"
                  connection={getConnection("KICK")}
                  loading={loading}
                  disconnecting={disconnecting}
                  onConnect={() => handleConnect("KICK")}
                  onDisconnect={() => handleDisconnect("KICK")}
                />

                {/* YouTube */}
                <ConnectionRow
                  provider="YOUTUBE"
                  label="YouTube"
                  icon="Y"
                  color="bg-red-600"
                  connection={getConnection("YOUTUBE")}
                  loading={loading}
                  disconnecting={disconnecting}
                  onConnect={() => handleConnect("YOUTUBE")}
                  onDisconnect={() => handleDisconnect("YOUTUBE")}
                />

                {/* Instagram */}
                <ConnectionRow
                  provider="INSTAGRAM"
                  label="Instagram"
                  icon="I"
                  color="bg-pink-600"
                  connection={getConnection("INSTAGRAM")}
                  loading={loading}
                  disconnecting={disconnecting}
                  onConnect={() => handleConnect("INSTAGRAM")}
                  onDisconnect={() => handleDisconnect("INSTAGRAM")}
                />

                {/* TikTok */}
                <ConnectionRow
                  provider="TIKTOK"
                  label="TikTok"
                  icon="Tt"
                  color="bg-black"
                  connection={getConnection("TIKTOK")}
                  loading={loading}
                  disconnecting={disconnecting}
                  onConnect={() => handleConnect("TIKTOK")}
                  onDisconnect={() => handleDisconnect("TIKTOK")}
                />

                {/* Twitter / X */}
                <ConnectionRow
                  provider="TWITTER"
                  label="X (Twitter)"
                  icon="X"
                  color="bg-zinc-900"
                  connection={getConnection("TWITTER")}
                  loading={loading}
                  disconnecting={disconnecting}
                  onConnect={() => handleConnect("TWITTER")}
                  onDisconnect={() => handleDisconnect("TWITTER")}
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* Subscription */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-zinc-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Subscription</CardTitle>
                      <CardDescription>
                        Manage your plan and billing
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="success">Free Tier</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500">
                  You&apos;re on the free tier. Upgrade to unlock more features.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Notifications */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-zinc-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Notifications</CardTitle>
                    <CardDescription>
                      Configure how you receive alerts
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Push notifications for new drafts", checked: true },
                  { label: "Sound alerts", checked: true },
                  { label: "Email daily summary", checked: false },
                ].map((setting, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-700">
                      {setting.label}
                    </span>
                    <button
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        setting.checked ? "bg-zinc-900" : "bg-zinc-200"
                      }`}
                    >
                      <div
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                          setting.checked ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* AI Personalization */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      AI Personalization
                    </CardTitle>
                    <CardDescription>
                      Help AI generate better drafts for your style
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/settings/ai-context">Edit Context</a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Will show active context or prompt to set up */}
                {/* Will show active context or prompt to set up */}
                {activeContext ? (
                  <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-zinc-900">
                        Current Configuration
                      </span>
                      <Badge variant="outline" className="text-xs">
                        v{activeContext.version}
                      </Badge>
                    </div>
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center gap-2 text-sm text-zinc-600">
                        <span className="font-medium text-zinc-700">
                          Category:
                        </span>
                        {activeContext.contentCategory === "OTHER"
                          ? activeContext.contentCategoryOther
                          : activeContext.contentCategory}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600">
                        <span className="font-medium text-zinc-700">Tone:</span>
                        {activeContext.tonePresets &&
                        activeContext.tonePresets.length > 0
                          ? activeContext.tonePresets.join(", ")
                          : "None"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-white hover:bg-zinc-100"
                      asChild
                    >
                      <a href="/settings/ai-context">Modify Context</a>
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-100">
                    <p className="text-sm text-zinc-600">
                      Personalize your AI to match your tone, content style, and
                      audience for more accurate draft suggestions.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full bg-white hover:bg-zinc-100"
                      asChild
                    >
                      <a href="/settings/ai-context">Set Up AI Context</a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Publishing Preferences */}
          <motion.div variants={item}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                    <Share2 className="h-5 w-5 text-zinc-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      Publishing Preferences
                    </CardTitle>
                    <CardDescription>
                      Configure how your posts are published
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-zinc-900">
                      Include stream link in posts
                    </span>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Automatically append your live stream URL to published
                      tweets
                    </p>
                  </div>
                  <button
                    onClick={handleToggleStreamLink}
                    disabled={savingSettings}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      includeStreamLink ? "bg-zinc-900" : "bg-zinc-200"
                    } ${savingSettings ? "opacity-50" : ""}`}
                  >
                    <div
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        includeStreamLink ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-zinc-900">
                      Auto-send affiliate links to chat
                    </span>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Automatically post affiliate links when products are
                      mentioned
                    </p>
                  </div>
                  <button
                    onClick={handleToggleAutoSendAffiliate}
                    disabled={savingSettings}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      autoSendAffiliate ? "bg-zinc-900" : "bg-zinc-200"
                    } ${savingSettings ? "opacity-50" : ""}`}
                  >
                    <div
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        autoSendAffiliate ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}
