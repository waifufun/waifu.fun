"use client";

import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EvmChainIds } from "@waifufun/types";
import type { FC, ReactNode } from "react";
import { useMemo, useState } from "react";
import { http, WagmiProvider } from "wagmi";
import { bsc } from "wagmi/chains";
import "@rainbow-me/rainbowkit/styles.css";

export const DEFAULT_EVM_CHAIN_ID = EvmChainIds.BscMainnet;
export const DEFAULT_EVM_CHAIN = bsc;
export const DEFAULT_EVM_RPC_URL =
	process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim() ||
	process.env.NEXT_PUBLIC_EVM_RPC_URL?.trim() ||
	"https://bsc-dataseed.binance.org/";

const walletConnectProjectId =
	process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_PROJECT_ID?.trim();
const hasWalletConnectProjectId = Boolean(walletConnectProjectId && walletConnectProjectId !== "waifu_fun_dev");
const projectId = walletConnectProjectId || "waifu_fun_dev";

const rainbowKitTheme = (() => {
	const baseTheme = darkTheme({
		accentColor: "#00ff87",
		accentColorForeground: "#08080a",
		borderRadius: "small",
		overlayBlur: "small",
	});

	return {
		...baseTheme,
		colors: {
			...baseTheme.colors,
			connectButtonBackground: "#08080a",
			connectButtonInnerBackground: "#111114",
			generalBorder: "rgba(255, 255, 255, 0.08)",
			generalBorderDim: "rgba(255, 255, 255, 0.06)",
			menuItemBackground: "rgba(0, 255, 135, 0.08)",
			modalBackground: "#08080a",
			modalBorder: "rgba(255, 255, 255, 0.08)",
			modalText: "#e4e4e7",
			modalTextDim: "#a1a1aa",
			modalTextSecondary: "#71717a",
			profileForeground: "#111114",
			selectedOptionBorder: "rgba(0, 255, 135, 0.32)",
		},
	};
})();

interface EvmProviderProps {
	children: ReactNode;
}

export const EvmProvider: FC<EvmProviderProps> = ({ children }) => {
	const [queryClient] = useState(() => new QueryClient());
	const config = useMemo(
		() =>
			getDefaultConfig({
				appName: "waifu.fun",
				projectId,
				chains: [DEFAULT_EVM_CHAIN],
				wallets: [
					{
						groupName: "Recommended",
						wallets: [
							injectedWallet,
							metaMaskWallet,
							coinbaseWallet,
							...(hasWalletConnectProjectId ? [walletConnectWallet] : []),
						],
					},
				],
				transports: {
					[DEFAULT_EVM_CHAIN.id]: http(DEFAULT_EVM_RPC_URL),
				},
			}),
		[],
	);

	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<RainbowKitProvider theme={rainbowKitTheme}>{children}</RainbowKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
};
