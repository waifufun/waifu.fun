"use client";

import { useEffect } from "react";
import { useAuth } from "@stwd/react";
import { setApiTokenGetter } from "@/lib/api-auth";

/**
 * Syncs the Steward auth token into the API client's module-level store.
 *
 * Mount this once near the app root (inside StewardProvider).
 * When the user is authenticated via Steward, all API requests made through
 * the `fetcher` in lib/api.ts will automatically include the JWT as
 * `Authorization: Bearer <token>`.
 *
 * Falls back gracefully: if not authenticated, no header is sent and the
 * existing cookie/wallet-based auth continues to work.
 */
export function useApiAuth() {
  const { getToken, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      setApiTokenGetter(getToken);
    } else {
      setApiTokenGetter(null);
    }

    return () => {
      setApiTokenGetter(null);
    };
  }, [isAuthenticated, getToken]);
}
