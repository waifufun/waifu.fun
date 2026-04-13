"use client";

import { useState } from "react";
import { useAuth } from "@stwd/react";
import { Button } from "./ui/button";
import { LogIn } from "lucide-react";
import { StewardLoginWidget } from "./steward/steward-login-widget";
import { StewardUserMenu } from "./steward/steward-user-menu";
import { useTranslation } from "@/contexts/locale-context";

/**
 * Header sign-in button for Steward auth.
 *
 * - Not authenticated: shows "Sign In" button that opens StewardLoginWidget modal
 * - Authenticated: shows StewardUserMenu (email/address + sign-out dropdown)
 */
export default function HeaderSignIn() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <StewardUserMenu />;
  }

  return (
    <>
      <Button
        className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm border border-[rgba(0,255,135,0.3)] bg-transparent text-[#00ff87] hover:bg-[rgba(0,255,135,0.08)] shadow-sm"
        onClick={() => setLoginOpen(true)}
      >
        <LogIn className="size-4 mr-2" />
        {t("wallet.signIn") ?? "Sign In"}
      </Button>
      <StewardLoginWidget open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
}
