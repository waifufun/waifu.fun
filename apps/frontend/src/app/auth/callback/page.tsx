"use client";

import { StewardEmailCallback } from "@stwd/react";
import { useRouter } from "next/navigation";

/**
 * Email magic-link callback page.
 * Steward redirects here with ?token=...&email=... after the user clicks the link.
 */
export default function EmailCallbackPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <StewardEmailCallback
        onSuccess={() => router.push("/")}
        onError={(err) => {
          console.error("[email-callback]", err);
          router.push("/");
        }}
        redirectTo="/"
      />
    </div>
  );
}
