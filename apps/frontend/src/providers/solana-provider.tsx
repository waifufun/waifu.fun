"use client";

import { SolanaWalletProvider } from "@stwd/react/wallet";
import type { FC, ReactNode } from "react";

/**
 * Solana wallet adapter wrapper for waifu.fun.
 *
 * Mounts @stwd/react's curated SolanaWalletProvider so the embedded
 * <WalletLogin chains="both"> panel inside <ConnectModal> can
 * connect Phantom / Solflare and complete a SIWS handshake against
 * Steward.
 *
 * Static-export safe: marked "use client" and dynamically imported by
 * apps/frontend/src/components/auth/connect-modal.tsx so @solana/* never resolves at
 * SSR time.
 *
 * RPC defaults to mainnet-beta. Override via NEXT_PUBLIC_SOLANA_RPC_URL.
 */

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";

interface SolanaProviderProps {
	children: ReactNode;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
	return <SolanaWalletProvider endpoint={SOLANA_RPC}>{children}</SolanaWalletProvider>;
};
