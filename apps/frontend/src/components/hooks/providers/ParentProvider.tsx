"use client";
import React, { FC, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { WalletProvider as WalletProviderHook } from "./UseWalletContext";
import { ModalProvider } from "./UseModalContext";
import { ModalManager } from "@/components/hooks/providers/ModalManager";

import "@solana/wallet-adapter-react-ui/styles.css";

export const ParentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(() => [new PhantomWalletAdapter()], [network]);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <WalletProviderHook>
            <ModalProvider>
                <ModalManager />
                {children}
            </ModalProvider>
            </WalletProviderHook>
          </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
