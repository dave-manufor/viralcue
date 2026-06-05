"use client";

import { useState, useEffect } from "react";

interface ExtensionStatus {
  status: "IDLE" | "CONNECTING" | "STREAMING" | "ERROR";
  streamId: string | null;
  sessionId: string | null;
}

interface UseExtensionReturn {
  isInstalled: boolean;
  isReady: boolean;
  version: string | null;
  status: ExtensionStatus["status"];
  activeStreamId: string | null;
  activeSessionId: string | null;
  activate: (params: {
    streamId: string;
    streamUrl: string;
    token: string;
    sessionId: string;
  }) => Promise<void>;
  deactivate: () => Promise<void>;
}

export function useExtension(): UseExtensionReturn {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<ExtensionStatus["status"]>("IDLE");
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Listen for extension response via postMessage
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (
        event.data?.type === "VIRALCUE_INSTALLED" &&
        event.data?.source === "viralcue-extension"
      ) {
        setIsInstalled(true);
        setIsReady(true);
        setVersion(event.data.version || "0.1.0");
      }

      if (event.data?.type === "VIRALCUE_STATUS_UPDATE") {
        setStatus(event.data.status || "IDLE");
        setActiveStreamId(event.data.streamId || null);
        setActiveSessionId(event.data.sessionId || null);
      }
    };

    window.addEventListener("message", handleMessage);

    // Listen for extension-ready event
    const handleReady = () => {
      pingExtension();
    };
    window.addEventListener("viralcue-extension-ready", handleReady);

    // Ping extension to check if installed
    const pingExtension = () => {
      window.dispatchEvent(new CustomEvent("viralcue-ping"));
    };

    // Ping immediately and after delays for slow-loading scenarios
    pingExtension();
    const timeouts = [100, 500, 1000, 2000].map((delay) =>
      setTimeout(pingExtension, delay)
    );

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("viralcue-extension-ready", handleReady);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  const activate = async (params: {
    streamId: string;
    streamUrl: string;
    token: string;
    sessionId: string;
  }) => {
    window.postMessage(
      {
        type: "VIRALCUE_START_RECORDING",
        payload: params,
      },
      window.location.origin
    );
  };

  const deactivate = async () => {
    window.postMessage({ type: "VIRALCUE_STOP_RECORDING" }, window.location.origin);
  };

  return {
    isInstalled,
    isReady,
    version,
    status,
    activeStreamId,
    activeSessionId,
    activate,
    deactivate,
  };
}
