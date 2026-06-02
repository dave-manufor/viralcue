"use client";

import { cn } from "@/lib/utils";

interface Connection {
  provider: string;
  platformUserId: string;
  needsReconnect?: boolean;
}

interface ChannelTogglesProps {
  draftType: "TWEET" | "THREAD" | "SHORT_VIDEO" | "AFFILIATE" | "CHAT_MESSAGE";
  enabledChannels: string[];
  connections: Connection[];
  onToggle: (channel: string) => void;
  onConnect: (channel: string) => void;
}

// Platform icon SVGs as JSX elements
const platformIcons: Record<string, JSX.Element> = {
  twitter: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  threads: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.332-3.023.853-.708 2.017-1.132 3.202-1.168.851-.026 1.596.078 2.286.266-.097-.853-.32-1.544-.67-2.078-.462-.706-1.2-1.064-2.194-1.064h-.078c-.803.018-1.534.26-2.177.72l-1.164-1.656c.906-.637 2.036-.99 3.27-1.018h.105c1.664 0 3.015.59 3.913 1.707.755.938 1.197 2.2 1.312 3.752.158.019.313.041.466.066 1.477.245 2.65.803 3.489 1.657.967 1.052 1.396 2.455 1.306 3.945-.101 1.682-.888 3.17-2.277 4.304-1.538 1.258-3.623 1.927-6.022 1.933H12.186zm1.638-8.9c-.834.022-1.569.237-2.072.606-.423.31-.638.72-.618 1.184.028.528.271.94.702 1.192.516.302 1.2.402 1.865.365 1.017-.055 1.816-.438 2.374-1.132.39-.485.665-1.147.829-1.987-.389-.07-.805-.118-1.25-.156-.611-.046-1.241-.082-1.83-.072z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
};

// Lock icon as inline SVG to avoid lucide-react type issues
const LockIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-muted-foreground"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Warning icon for expired tokens
const WarningIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 text-orange-500"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" x2="12" y1="9" y2="13" />
    <line x1="12" x2="12.01" y1="17" y2="17" />
  </svg>
);

// Platform config - use colors that are visible on card backgrounds
const PLATFORM_CONFIG: Record<string, { color: string; name: string }> = {
  twitter: { color: "text-foreground", name: "X" },
  threads: { color: "text-foreground", name: "Threads" },
  instagram: { color: "text-pink-500", name: "Instagram" },
  tiktok: { color: "text-foreground", name: "TikTok" },
  youtube: { color: "text-red-500", name: "YouTube" },
};

// Channels by content type
const CHANNELS_BY_TYPE: Record<string, string[]> = {
  TWEET: ["twitter", "threads"],
  THREAD: ["twitter", "threads"],
  SHORT_VIDEO: ["instagram", "tiktok", "youtube"],
  AFFILIATE: [],
  CHAT_MESSAGE: [],
};

export function ChannelToggles({
  draftType,
  enabledChannels,
  connections,
  onToggle,
  onConnect,
}: ChannelTogglesProps) {
  const channels = CHANNELS_BY_TYPE[draftType] || [];

  if (channels.length === 0) return null;

  const isConnected = (channel: string) =>
    connections.some((c) => c.provider.toLowerCase() === channel);

  const isEnabled = (channel: string) => enabledChannels.includes(channel);

  const needsReconnect = (channel: string) =>
    connections.find((c) => c.provider.toLowerCase() === channel)
      ?.needsReconnect ?? false;

  const handleClick = (channel: string) => {
    const expired = needsReconnect(channel);
    if (!isConnected(channel) || expired) {
      onConnect(channel);
      return;
    }
    onToggle(channel);
  };

  return (
    <div className="flex items-center gap-1.5">
      {channels.map((channel) => {
        const config = PLATFORM_CONFIG[channel];
        const icon = platformIcons[channel];
        if (!config || !icon) return null;

        const connected = isConnected(channel);
        const expired = needsReconnect(channel);
        const enabled = isEnabled(channel) && connected && !expired;

        return (
          <button
            key={channel}
            onClick={(e) => {
              e.stopPropagation();
              handleClick(channel);
            }}
            className={cn(
              "relative p-1.5 rounded-full transition-all duration-200",
              "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring",
              enabled ? "bg-primary/10" : "bg-transparent",
              expired && "ring-2 ring-orange-500/50"
            )}
            title={
              expired
                ? `⚠️ ${config.name} token expired - click to reconnect`
                : !connected
                  ? `Connect ${config.name} to post`
                  : enabled
                    ? `Posting to ${config.name}`
                    : `Click to enable ${config.name}`
            }
          >
            <span
              className={cn(
                "transition-colors",
                expired
                  ? "text-orange-500"
                  : enabled
                    ? config.color
                    : "text-zinc-400 dark:text-zinc-500"
              )}
            >
              {icon}
            </span>
            {/* Horizontal strikethrough line for disabled icons */}
            {!enabled && !expired && (
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 bg-zinc-400 dark:bg-zinc-500 pointer-events-none"
                aria-hidden="true"
              />
            )}
            {expired && <WarningIcon />}
            {!connected && !expired && <LockIcon />}
          </button>
        );
      })}
    </div>
  );
}

export function getPlatformName(platform: string): string {
  return PLATFORM_CONFIG[platform]?.name || platform;
}
