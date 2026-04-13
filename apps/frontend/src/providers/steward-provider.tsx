"use client";

import { useMemo, type FC, type ReactNode } from "react";
import { StewardProvider as BaseStewardProvider } from "@stwd/react";
import { StewardClient } from "@stwd/sdk";

/**
 * Steward auth + wallet provider for waifu.fun
 *
 * Wraps the @stwd/react StewardProvider with waifu tenant config.
 * Place inside EvmProvider so SIWE can access wagmi's wallet context.
 */

const STEWARD_API_URL =
  process.env.NEXT_PUBLIC_STEWARD_API_URL?.trim() || "https://eliza.steward.fi";
const STEWARD_TENANT_ID =
  process.env.NEXT_PUBLIC_STEWARD_TENANT_ID?.trim() || "waifu";

// Dummy agent ID — auth-only usage doesn't need a real agent
const STEWARD_AGENT_ID = "waifu-web";

// Match waifu.fun's design tokens
const WAIFU_THEME = {
  primaryColor: "#00ff87",
  accentColor: "#00ff87",
  backgroundColor: "#08080a",
  surfaceColor: "#111114",
  textColor: "#e4e4e7",
  mutedColor: "#71717a",
  successColor: "#00ff87",
  errorColor: "#ef4444",
  warningColor: "#f59e0b",
  borderRadius: 4,
  colorScheme: "dark" as const,
};

interface WaifuStewardProviderProps {
  children: ReactNode;
}

export const WaifuStewardProvider: FC<WaifuStewardProviderProps> = ({
  children,
}) => {
  const client = useMemo(
    () =>
      new StewardClient({
        baseUrl: STEWARD_API_URL,
        tenantId: STEWARD_TENANT_ID,
      }),
    [],
  );

  return (
    <BaseStewardProvider
      client={client}
      agentId={STEWARD_AGENT_ID}
      auth={{ baseUrl: STEWARD_API_URL }}
      tenantId={STEWARD_TENANT_ID}
      theme={WAIFU_THEME}
      features={{
        showFundingQR: false,
        showTransactionHistory: false,
        showSpendDashboard: false,
        showPolicyControls: false,
        showApprovalQueue: false,
        showSecretManager: false,
        enableSolana: false,
        showChainSelector: false,
        allowAddressExport: false,
      }}
    >
      {children}
    </BaseStewardProvider>
  );
};
