import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { EVMWallet } from '@/components/wallet/EVMWallet';
import { SolanaWallet } from '@/components/wallet/SolanaWallet';
import { EvmChainIds, SolanaNetworkIds } from '@autofun/types';

type EVMWallets = {
    [key in EvmChainIds]: EVMWallet;
}

type SolanaWallets = {
    [key in SolanaNetworkIds]: SolanaWallet;
}

export type TWalletContext = {
    evmWallets: EVMWallets | null;
    setEvmWallets: (wallet: EVMWallets | null) => void;
    solanaWallets: SolanaWallets | null;
    setSolanaWallets: (wallet: SolanaWallets | null) => void; 
};

const WalletContext = createContext<TWalletContext | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [evmWallets, setEvmWallets] = useState<EVMWallets | null>(null);
    const [solanaWallets, setSolanaWallets] = useState<SolanaWallets | null>(null);


    return (
        <WalletContext.Provider value={{ evmWallets, setEvmWallets, solanaWallets, setSolanaWallets }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = (): TWalletContext => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWalletContext not inside a WalletProvider');
    }
    return context;
};