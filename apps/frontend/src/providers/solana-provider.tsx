"use client";

import type { FC, ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { HELIUS_RPC_URL } from "@/lib/api";

interface SolanaProviderProps {
	children: ReactNode;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
	return (
		<ConnectionProvider endpoint={HELIUS_RPC_URL}>
			<WalletProvider wallets={[]} autoConnect>
				<WalletModalProvider>{children}</WalletModalProvider>
			</WalletProvider>
		</ConnectionProvider>
	);
};
