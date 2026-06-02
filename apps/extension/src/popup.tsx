import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  UserButton
} from "@clerk/chrome-extension"
import { ExternalLink, Zap } from "lucide-react"

import "~style.css"

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY
const SYNC_HOST =
  process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST || "http://localhost:3000"

if (!PUBLISHABLE_KEY) {
  console.warn(
    "Missing PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY - running in limited mode"
  )
}

function Popup() {
  const openDashboard = () => {
    chrome.tabs.create({ url: SYNC_HOST + "/dashboard" })
  }

  const openLogin = () => {
    chrome.tabs.create({ url: SYNC_HOST + "/login" })
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY || "pk_test_placeholder"}
      syncHost={SYNC_HOST}>
      <div className="plasmo-w-[320px] plasmo-p-4 plasmo-bg-zinc-900 plasmo-text-white">
        {/* Header */}
        <div className="plasmo-flex plasmo-items-center plasmo-gap-2 plasmo-mb-4">
          <div className="plasmo-flex plasmo-h-8 plasmo-w-8 plasmo-items-center plasmo-justify-center plasmo-rounded-lg plasmo-bg-violet-600">
            <Zap className="plasmo-h-4 plasmo-w-4 plasmo-text-white" />
          </div>
          <span className="plasmo-text-lg plasmo-font-semibold">ViralCue</span>
        </div>

        <SignedIn>
          {/* Logged in state */}
          <div className="plasmo-space-y-3">
            <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-p-3 plasmo-bg-zinc-800 plasmo-rounded-lg">
              <div className="plasmo-flex plasmo-items-center plasmo-gap-2">
                <div className="plasmo-w-2 plasmo-h-2 plasmo-bg-green-500 plasmo-rounded-full plasmo-animate-pulse" />
                <span className="plasmo-text-sm plasmo-text-zinc-300">
                  Connected
                </span>
              </div>
              <UserButton
                afterSignOutUrl={SYNC_HOST + "/login"}
                appearance={{
                  elements: {
                    avatarBox: "plasmo-h-7 plasmo-w-7"
                  }
                }}
              />
            </div>

            <button
              onClick={openDashboard}
              className="plasmo-w-full plasmo-flex plasmo-items-center plasmo-justify-center plasmo-gap-2 plasmo-py-2 plasmo-px-4 plasmo-bg-violet-600 hover:plasmo-bg-violet-700 plasmo-rounded-lg plasmo-transition-colors">
              <span>Open Dashboard</span>
              <ExternalLink className="plasmo-h-4 plasmo-w-4" />
            </button>
          </div>
        </SignedIn>

        <SignedOut>
          {/* Logged out state */}
          <div className="plasmo-space-y-3">
            <p className="plasmo-text-sm plasmo-text-zinc-400">
              Sign in to access your AI streaming co-pilot
            </p>
            <button
              onClick={openLogin}
              className="plasmo-w-full plasmo-py-2 plasmo-px-4 plasmo-bg-violet-600 hover:plasmo-bg-violet-700 plasmo-rounded-lg plasmo-transition-colors">
              Sign In
            </button>
          </div>
        </SignedOut>

        {/* Footer */}
        <div className="plasmo-mt-4 plasmo-pt-3 plasmo-border-t plasmo-border-zinc-700">
          <p className="plasmo-text-xs plasmo-text-zinc-500 plasmo-text-center">
            Real-time AI co-pilot for live streamers
          </p>
        </div>
      </div>
    </ClerkProvider>
  )
}

export default Popup
