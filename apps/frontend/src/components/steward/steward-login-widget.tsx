"use client";

import { useCallback } from "react";
import { StewardLogin, useAuth } from "@stwd/react";
import { useAccount, useSignMessage } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface StewardLoginWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal-wrapped Steward login for waifu.fun.
 *
 * Shows email, SIWE (wallet), Google, and Discord sign-in options.
 * Uses the existing wagmi wallet connection for SIWE signing.
 */
export function StewardLoginWidget({
  open,
  onOpenChange,
}: StewardLoginWidgetProps) {
  const { isAuthenticated } = useAuth();

  // Close on successful login
  const handleSuccess = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // If already authed, don't show
  if (isAuthenticated) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[420px] border border-[rgba(255,255,255,0.08)] bg-[#08080a] p-0 gap-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Sign in to waifu.fun</DialogTitle>
          <DialogDescription>
            Sign in with email, wallet, or social account
          </DialogDescription>
        </DialogHeader>
        <div className="p-1">
          <StewardLogin
            variant="inline"
            title="sign in"
            subtitle="email, wallet, or social"
            showEmail
            showSIWE
            showGoogle
            showDiscord
            onSuccess={handleSuccess}
            onError={(err) => console.error("[steward-login]", err)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
