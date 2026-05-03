"use client";

import { StewardProvider as BaseStewardProvider, useAuth } from "@stwd/react";
import { StewardAuth, StewardClient } from "@stwd/sdk";
import { type FC, type ReactNode, useEffect, useMemo, useRef } from "react";

/**
 * Steward auth + wallet provider for waifu.fun
 *
 * Wraps the @stwd/react StewardProvider with waifu tenant config.
 * Place inside EvmProvider so SIWE can access wagmi's wallet context.
 */

const STEWARD_API_URL = process.env.NEXT_PUBLIC_STEWARD_API_URL?.trim() || "https://eliza.steward.fi";
const STEWARD_TENANT_ID = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID?.trim() || "waifu";

// Dummy agent ID: auth-only usage doesn't need a real agent
const STEWARD_AGENT_ID = "waifu-web";
const REFRESH_CHECK_INTERVAL_MS = 60_000;
const REFRESH_AHEAD_SECS = 120;

// Match waifu.fun's design tokens
const BRAND_THEME = {
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

function StewardAutoRefresh({ children }: { children: ReactNode }) {
	const { session } = useAuth();
	const authRef = useRef<StewardAuth | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		authRef.current = new StewardAuth({
			baseUrl: STEWARD_API_URL,
			tenantId: STEWARD_TENANT_ID,
		});
	}, []);

	useEffect(() => {
		if (!session) return;

		const checkAndRefresh = async () => {
			const auth = authRef.current;
			if (!auth || !auth.isNearExpiry()) return;
			try {
				await auth.refreshSession();
			} catch (error) {
				console.warn("[steward] Auto-refresh failed", error);
			}
		};

		void checkAndRefresh();
		const interval = window.setInterval(() => {
			const expiresAt = authRef.current?.getSession()?.expiresAt;
			if (!expiresAt) return;
			const secsRemaining = expiresAt - Date.now() / 1000;
			if (secsRemaining > 0 && secsRemaining < REFRESH_AHEAD_SECS) {
				void checkAndRefresh();
			}
		}, REFRESH_CHECK_INTERVAL_MS);

		return () => {
			window.clearInterval(interval);
		};
	}, [session]);

	return <>{children}</>;
}

export const WaifuStewardProvider: FC<WaifuStewardProviderProps> = ({ children }) => {
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
			theme={BRAND_THEME}
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
			<StewardAutoRefresh>{children}</StewardAutoRefresh>
		</BaseStewardProvider>
	);
};
