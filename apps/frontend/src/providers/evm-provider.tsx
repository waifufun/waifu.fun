"use client";

import type { FC, ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { ConnectKitProvider } from "connectkit";
import { CHAINID_TO_VIEM_CHAIN } from "@autofun/constants";
import { logChainAvailability } from "@/lib/chain-availability";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EvmChainIds } from "@autofun/types";
import { walletConnect, coinbaseWallet, injected } from "wagmi/connectors";

interface EvmProviderProps {
	children: ReactNode;
}

function ChainLogger() {
	useEffect(() => {
		logChainAvailability();
	}, []);
	return null;
}

export const EvmProvider: FC<EvmProviderProps> = ({ children }) => {
	// Create config immediately on client (this component is dynamically imported with ssr: false)
	const [config] = useState(() => {
		// Hardcode available chains for localnet dev - avoid any SSR env var checks
		const availableChainIds = process.env.NODE_ENV === "development" 
			? [EvmChainIds.JejuLocalnet] 
			: [EvmChainIds.JejuMainnet, EvmChainIds.JejuTestnet];
		
		const chains = availableChainIds.map((id) => CHAINID_TO_VIEM_CHAIN[id]);
		
		// Use native Wagmi createConfig instead of ConnectKit's getDefaultConfig
		// Only include WalletConnect if a valid project ID is provided
		const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
		const hasValidProjectId = walletConnectProjectId && 
			walletConnectProjectId !== "your_project_id_here" && 
			walletConnectProjectId !== "demo-project-id";
		
		const connectors = [
			injected(),
			coinbaseWallet({ appName: "auto.fun" }),
		];
		
		// Add WalletConnect only if configured (optional for local dev)
		if (hasValidProjectId) {
			connectors.splice(1, 0, walletConnect({ projectId: walletConnectProjectId }));
		}
		
		return createConfig({
			chains: chains as any,
			connectors,
			transports: Object.fromEntries(
				chains.map((chain) => [chain.id, http()])
			),
		});
	});

	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchOnWindowFocus: false,
						retry: false,
					},
				},
			})
	);

	// This component only renders on client due to dynamic import with ssr: false
	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<ConnectKitProvider>
					<ChainLogger />
					{children}
				</ConnectKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
};
