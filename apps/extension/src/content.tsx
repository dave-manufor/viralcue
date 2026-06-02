import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "http://localhost:3000/*",
    "https://*.viralcue.io/*",
    "https://www.twitch.tv/*",
    "https://www.youtube.com/*",
    "https://kick.com/*"
  ],
  run_at: "document_start"
}

// ============================================
// DASHBOARD DETECTION (viralcue domains)
// ============================================

const isViralCueDomain =
  window.location.hostname === "localhost" ||
  window.location.hostname.includes("viralcue")

if (isViralCueDomain) {
  // Listen for ping from dashboard to detect extension
  window.addEventListener("viralcue-ping", () => {
    window.postMessage(
      {
        type: "VIRALCUE_INSTALLED",
        version: "0.1.0",
        source: "viralcue-extension"
      },
      "*"
    )
  })

  // Dispatch event that extension is loaded
  window.dispatchEvent(new CustomEvent("viralcue-extension-ready"))

  console.log("[ViralCue] Extension content script loaded")
}

// ============================================
// STREAMING SITE DETECTION
// ============================================

interface StreamInfo {
  platform: "twitch" | "youtube" | "kick"
  channelName: string
  isLive: boolean
}

const STREAMING_SITES: Record<
  string,
  {
    pattern: RegExp
    getStreamInfo: () => StreamInfo
  }
> = {
  twitch: {
    pattern: /twitch\.tv/,
    getStreamInfo: () => {
      const channelName = window.location.pathname.split("/")[1] || ""
      const isLive = !!document.querySelector(
        '[data-a-target="player-overlay-click-handler"]'
      )
      return { platform: "twitch", channelName, isLive }
    }
  },
  youtube: {
    pattern: /youtube\.com/,
    getStreamInfo: () => {
      const isLive = !!document.querySelector(".ytp-live-badge")
      const channelName =
        document.querySelector("#channel-name a")?.textContent || ""
      return { platform: "youtube", channelName, isLive }
    }
  },
  kick: {
    pattern: /kick\.com/,
    getStreamInfo: () => {
      const channelName = window.location.pathname.split("/")[1] || ""
      const isLive = !!document.querySelector('[data-testid="stream-player"]')
      return { platform: "kick", channelName, isLive }
    }
  }
}

function detectStreamingContext(): StreamInfo | null {
  const url = window.location.href

  for (const [, config] of Object.entries(STREAMING_SITES)) {
    if (config.pattern.test(url)) {
      return config.getStreamInfo()
    }
  }

  return null
}

function initStreamDetection() {
  const streamInfo = detectStreamingContext()

  if (streamInfo) {
    chrome.runtime
      .sendMessage({
        type: "STREAM_DETECTED",
        data: streamInfo
      })
      .catch(() => {
        // Extension context may not be ready yet
      })

    console.log("[ViralCue] Stream detected:", streamInfo)
  }
}

// Watch for SPA navigation (Twitch, YouTube use client-side routing)
let lastUrl = window.location.href
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    initStreamDetection()
  }
})

if (typeof document !== "undefined" && document.body) {
  observer.observe(document.body, { childList: true, subtree: true })
}

// Initialize on load
if (!isViralCueDomain) {
  initStreamDetection()
}

// No UI overlay - this is a headless content script
export default function Content() {
  return null
}
