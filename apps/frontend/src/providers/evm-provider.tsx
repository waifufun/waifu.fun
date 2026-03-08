"use client";

import type { FC, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

const config = getDefaultConfig({
	appName: "waifu.fun",
	projectId: "waifu_fun_dev",
	chains: [bsc],
	transports: {
		[bsc.id]: http("https://bsc-dataseed.binance.org/"),
	},
});

const queryClient = new QueryClient();

interface EvmProviderProps {
	children: ReactNode;
}

export const EvmProvider: FC<EvmProviderProps> = ({ children }) => {
	return (
		<WagmiProvider config={config}>
			<QueryClientProvider client={queryClient}>
				<RainbowKitProvider
					theme={darkTheme({
						accentColor: "#00ff87",
						accentColorForeground: "#08080a",
					})}
				>
					{children}
				</RainbowKitProvider>
			</QueryClientProvider>
		</WagmiProvider>
	);
};
