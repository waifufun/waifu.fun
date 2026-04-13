"use client";

import { useApiAuth } from "@/hooks/use-api-auth";

/**
 * Invisible component that syncs the Steward JWT into the API client.
 *
 * Mount inside StewardProvider. Renders nothing — just runs the hook.
 */
export function ApiAuthSync() {
  useApiAuth();
  return null;
}
