import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { EVMWallet } from '@/components/wallet/EVMWallet';
import { ISolanaFunctions, SolanaWallet } from '@/components/wallet/SolanaWallet';
import { EvmChainIds, SolanaAddressLike, SolanaNetworkIds } from '@autofun/types';
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from '@solana/web3.js';

type EVMWallets = {
    [key in EvmChainIds]: EVMWallet;
}

type SolanaWallets = {
    [key in SolanaNetworkIds]: SolanaWallet;
}

export type TWalletContext = {
    evmWallets: EVMWallets | null;
    solanaWallets: SolanaWallets | null;
};

const WalletContext = createContext<TWalletContext | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [evmWallets, setEvmWallets] = useState<EVMWallets | null>(null);
    const [solanaWallets, setSolanaWallets] = useState<SolanaWallets | null>(null);
    const { publicKey, disconnecting, connected, signMessage, signTransaction } = useWallet();


    useEffect(() => {
        if (publicKey && connected && !disconnecting && signMessage && signTransaction) {
            const solanaAddress = publicKey.toBase58() as SolanaAddressLike;
            const walletAdapterFunctions: ISolanaFunctions = {
                signMessage: async (message: Uint8Array) => {
                    return signMessage(message);
                },
                signTransaction: async (transaction: Transaction | VersionedTransaction) => {
                    return signTransaction(transaction);
                },
            };

            const mainnetSolanaWallet = new SolanaWallet(
                solanaAddress,
                SolanaNetworkIds.Mainnet,
                walletAdapterFunctions
            );

            const devnetSolanaWallet = new SolanaWallet(
                solanaAddress,
                SolanaNetworkIds.Devnet,
                walletAdapterFunctions
            );

            setSolanaWallets({
                [SolanaNetworkIds.Mainnet]: mainnetSolanaWallet,
                [SolanaNetworkIds.Devnet]: devnetSolanaWallet,
            });
        } else {
            setSolanaWallets(null);
        }
    }, [publicKey, connected, disconnecting, signMessage, signTransaction]);


    return (
        <WalletContext.Provider value={{ evmWallets, solanaWallets}}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallets = (): TWalletContext => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWalletContext not inside a WalletProvider');
    }
    return context;
};