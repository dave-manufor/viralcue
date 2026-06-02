"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Hook that returns a fetch function with Clerk auth token attached.
 */
export function useAuthFetch() {
  const { getToken } = useAuth();

  const authFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = await getToken();

      const url = path.startsWith("http") ? path : `${API_URL}${path}`;

      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    },
    [getToken]
  );

  return authFetch;
}
