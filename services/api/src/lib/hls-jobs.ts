/**
 * HLS Capture job management
 * Communicates with the HLS Fetcher service
 */

const HLS_FETCHER_URL = process.env.HLS_FETCHER_URL || "http://localhost:3003";

export interface StartCaptureParams {
  userId: string;
  sessionId: string;
  channelName: string;
  platform: "TWITCH" | "KICK" | "YOUTUBE";
}

/**
 * Start an HLS capture job
 */
export async function startHlsCapture(
  params: StartCaptureParams
): Promise<boolean> {
  try {
    const response = await fetch(`${HLS_FETCHER_URL}/capture/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: params.userId,
        sessionId: params.sessionId,
        channelName: params.channelName,
        platform: params.platform,
      }),
    });

    if (!response.ok) {
      console.error(`[HLS Capture] Failed to start: ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("[HLS Capture] Error starting capture:", error);
    return false;
  }
}

/**
 * Stop an HLS capture job
 */
export async function stopHlsCapture(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${HLS_FETCHER_URL}/capture/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      console.error(`[HLS Capture] Failed to stop: ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("[HLS Capture] Error stopping capture:", error);
    return false;
  }
}

/**
 * Get HLS Fetcher status
 */
export async function getHlsFetcherStatus(): Promise<{
  activeJobs: any[];
} | null> {
  try {
    const response = await fetch(`${HLS_FETCHER_URL}/status`);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[HLS Capture] Error getting status:", error);
    return null;
  }
}
