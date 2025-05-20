import type React from "react";
import { createContext, useContext, useState, type ReactNode, useEffect } from "react";
import { EVMWallet, type IEVMFunctions } from "@/components/wallet/EVMWallet";
import { type ISolanaFunctions, SolanaWallet } from "@/components/wallet/SolanaWallet";
import { AddressLike, type EvmAddressLike, EvmChainIds, type SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useSignMessage, useSendTransaction, useSwitchChain, useDisconnect } from "wagmi";
import { useMutation, useQuery } from "@tanstack/react-query";
import { authenticate, generateNonce, getWallets, logOut } from "@/lib/api";
import { toast } from "sonner";
import { signSolanaMessage } from "@/lib/utils";

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
	const {
		publicKey,
		disconnecting,
		connected,
		signMessage,
		sendTransaction: sendTransactionSolana,
		disconnect: disconnectSol,
	} = useWallet();
	const { address, isConnected } = useAppKitAccount();
	const { switchChainAsync } = useSwitchChain();
	const { signMessageAsync: evmSignMessage } = useSignMessage();
	const { sendTransaction } = useSendTransaction();
	const { chainId } = useAppKitNetwork();
	const { connection } = useConnection();
	const { disconnect: disconnectEVM } = useDisconnect();

	const nonceMutation = useMutation({
		mutationKey: ["generateNonce"],
		mutationFn: generateNonce,
		onSuccess: async (result: any) => {},
		onError: (e) => {
			toast.error(`Error: ${e.message}`);
		},
	});

	const authMutation = useMutation({
		mutationKey: ["authenticate"],
		mutationFn: ({ address, signature, chain }: { address: AddressLike; signature: string; chain: "solana" | "evm" }) =>
			authenticate(address, signature, chain),
		onSuccess: async (result: any) => {
			if (result.success) {
				toast.success("Authenticated successfully");
			} else {
				toast.error(`Error: ${result.error}`);
			}
		},
		onError: (e) => {
			toast.error(`Error: ${e.message}`);
		},
	});

	const logOutMutation = useMutation({
		mutationKey: ["logOut"],
		mutationFn: logOut,
		onSuccess: () => {
			toast.success("Disconnected successfully");
		},
		onError: (e) => {
			toast.error(`Error logging out: ${e.message}`);
		},
	});


	const {
		data: remoteWallets,
		isLoading: remoteWalletsLoading,
		isError: remoteWalletsError,
		refetch: refetchRemoteWallets,
	} = useQuery({
		queryKey: ["getWallets"],
		queryFn: async () => {
			try {
				const wallets = await getWallets();
				console.log("remoteWallets", wallets);
				return wallets;
			} catch (e: any) {
				toast.error(`Error fetching remote wallets: ${e.message}`);
				throw e;
			}
		},
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const handleRemoteConnect = async () => {
		console.log("handleRemoteConnect");
		console.log("remoteWallets", remoteWallets);
		if (remoteWallets.wallets.evm == null) {
			if (address && isConnected) {
				const data = await nonceMutation.mutateAsync(address as AddressLike);
				console.log("data.nonce", data);
				const signature = await evmSignMessage({ message: data.nonce });
				const addressConverted = address as EvmAddressLike;
				await authMutation.mutateAsync({ address: addressConverted, signature, chain: "evm" });
				if (authMutation.isError) {
					disconnectEVM();
					toast.error("Error: EVM Authentication failed");
				}

				await refetchRemoteWallets();
			}
		}

		if (remoteWallets.wallets.solana == null) {
			if (publicKey && connected && !disconnecting && signMessage) {
				const data = await nonceMutation.mutateAsync(publicKey.toBase58() as AddressLike);
				const signature = await signSolanaMessage(data.nonce, signMessage);
				await authMutation.mutateAsync({
					address: publicKey.toBase58() as AddressLike,
					signature: signature.toString(),
					chain: "solana",
				});
				if (authMutation.isError) {
					disconnectSol();
					toast.error("Error: Solana Authentication failed");
				}

				await refetchRemoteWallets();
			}
		}
	};

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

			handleRemoteConnect();
		} else if (!connected) {
			setSolanaWallets(null);
			logOutMutation.mutate("solana");
			refetchRemoteWallets();

		}
	}, [publicKey, connected, disconnecting, signMessage, sendTransactionSolana]);

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

			handleRemoteConnect();
		} else {
			setEvmWallets(null);
			logOutMutation.mutate("evm");
			refetchRemoteWallets();
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
