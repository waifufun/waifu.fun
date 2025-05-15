import type React from "react";
import { createContext, useContext, useState, type ReactNode, useEffect } from "react";
import { EVMWallet, type IEVMFunctions } from "@/components/wallet/EVMWallet";
import { type ISolanaFunctions, SolanaWallet } from "@/components/wallet/SolanaWallet";
import { type EvmAddressLike, EvmChainIds, type SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useSignMessage, useSendTransaction, useSwitchChain } from "wagmi";

type EVMWallets = {
	[key in keyof typeof EvmChainIds]: EVMWallet;
};

type SolanaWallets = {
	[key in keyof typeof SolanaNetworkIds]: SolanaWallet;
};

export type TWalletContext = {
	evmWallets: EVMWallets | null;
	solanaWallets: SolanaWallets | null;
};

const WalletContext = createContext<TWalletContext | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [evmWallets, setEvmWallets] = useState<EVMWallets | null>(null);
	const [solanaWallets, setSolanaWallets] = useState<SolanaWallets | null>(null);
	const { publicKey, disconnecting, connected, signMessage, sendTransaction: sendTransactionSolana } = useWallet();
	const { address, isConnected } = useAppKitAccount();
	const { switchChainAsync } = useSwitchChain();
	const { signMessageAsync: evmSignMessage } = useSignMessage();
	const { sendTransaction } = useSendTransaction();
	const { chainId } = useAppKitNetwork();
	const { connection } = useConnection();

	useEffect(() => {
		if (publicKey && connected && !disconnecting && signMessage && sendTransactionSolana) {
			const solanaAddress = publicKey.toBase58() as SolanaAddressLike;
			const walletAdapterFunctions: ISolanaFunctions = {
				signMessage: async (message: Uint8Array) => {
					return signMessage(message);
				},
				sendTransaction: async (transaction: Transaction | VersionedTransaction) => {
					const signature = await sendTransactionSolana(transaction, connection);
					return signature;
				},
			};

			const mainnetSolanaWallet = new SolanaWallet(solanaAddress, SolanaNetworkIds.Mainnet, walletAdapterFunctions);

			const devnetSolanaWallet = new SolanaWallet(solanaAddress, SolanaNetworkIds.Devnet, walletAdapterFunctions);

			setSolanaWallets({
				Mainnet: mainnetSolanaWallet,
				Devnet: devnetSolanaWallet,
			});
		} else {
			setSolanaWallets(null);
		}
	}, [publicKey, connected, disconnecting, signMessage, sendTransactionSolana, connection]);

	useEffect(() => {
		if (address && isConnected) {
			const functions: IEVMFunctions = {
				signMessage: async (message: string) => {
					const signature = await evmSignMessage({ message });
					return signature;
				},
				sendTransaction: async (transaction: any) => {
					const signedTx = await sendTransaction(transaction);
					return signedTx;
				},
				chainId: chainId as EvmChainIds,
				switchNetwork: async (networkId: EvmChainIds) => {
					await switchChainAsync({ chainId: networkId });
				},
			};

			setEvmWallets({
				BaseMainnet: new EVMWallet(address as EvmAddressLike, EvmChainIds.BaseMainnet, functions),
				EthereumMainnet: new EVMWallet(address as EvmAddressLike, EvmChainIds.EthereumMainnet, functions),
				EthereumSepolia: new EVMWallet(address as EvmAddressLike, EvmChainIds.EthereumSepolia, functions),
				BaseSepolia: new EVMWallet(address as EvmAddressLike, EvmChainIds.BaseSepolia, functions),
			});
		} else {
			setEvmWallets(null);
		}
	}, [address, isConnected]);

	return <WalletContext.Provider value={{ evmWallets, solanaWallets }}>{children}</WalletContext.Provider>;
};

export const useWallets = (): TWalletContext => {
	const context = useContext(WalletContext);
	if (!context) {
		throw new Error("useWalletContext not inside a WalletProvider");
	}
	return context;
};
