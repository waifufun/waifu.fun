"use client";

import { Button } from "./ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useIsClient } from "usehooks-ts";
import { LogOut, User, Wallet } from "lucide-react";
import { useSidebar } from "./ui/sidebar";
import { useEffect, useState, useRef } from "react";
import { authenticate, generateNonce, getAuthStatus, logOut } from "@/lib/api";
import type { AddressLike } from "@autofun/types";
import bs58 from "bs58";
import { useRouter } from "next/navigation";

export default function ConnectWallet() {
	const client = useIsClient();
	const modal = useWalletModal();
	const wallet = useWallet();
	const { state } = useSidebar();
	const [isCheckingAuth, setIsCheckingAuth] = useState(true);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [authenticatedAddress, setAuthenticatedAddress] = useState<string | null>(null);
	const hasInitialized = useRef(false);
	const walletStateRef = useRef<{ connected: boolean; address: string | null }>({ connected: false, address: null });
	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const router = useRouter();

	const isCollapsed = state === "collapsed";

	// Check authentication status on mount only
	useEffect(() => {
		const checkAuthStatus = async () => {
			try {
				const authStatus = await getAuthStatus();
				setIsAuthenticated(authStatus.authenticated);
				setAuthenticatedAddress(authStatus.wallets?.solana?.address || null);
				console.log("Authentication status:", authStatus);
			} catch (error) {
				console.error("Failed to check authentication status:", error);
				setIsAuthenticated(false);
				setAuthenticatedAddress(null);
			} finally {
				setIsCheckingAuth(false);
			}
		};

		checkAuthStatus();
	}, []);

	// Handle wallet connection changes with debouncing
	useEffect(() => {
		const currentAddress = wallet.publicKey?.toBase58() || null;
		const currentConnected = wallet.connected;

		// Clear any existing timeout
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}

		// Debounce the wallet state changes to prevent rapid fluctuations
		debounceTimeoutRef.current = setTimeout(async () => {
			// Check if the state actually changed
			const prevState = walletStateRef.current;
			const stateChanged = prevState.connected !== currentConnected || prevState.address !== currentAddress;

			if (!stateChanged) {
				return;
			}

			console.log("[Wallet] State change:", {
				from: { connected: prevState.connected, address: prevState.address },
				to: { connected: currentConnected, address: currentAddress },
			});

			// Update the ref
			walletStateRef.current = { connected: currentConnected, address: currentAddress };

			if (currentConnected && currentAddress && wallet.signMessage) {
				if (isAuthenticated && authenticatedAddress === currentAddress) {
					console.log("Already authenticated for this address:", currentAddress);
					return;
				}

				// Prevent multiple authentication attempts during initial load
				if (hasInitialized.current) {
					console.log("Skipping authentication - already initialized");
					return;
				}

				try {
					console.log("Authenticating new or different Solana wallet:", currentAddress);

					const { nonce } = await generateNonce(currentAddress as AddressLike);
					const message = new TextEncoder().encode(nonce);
					const signature = await wallet.signMessage(message);

					const signatureBase58 = bs58.encode(signature);

					await authenticate(currentAddress as AddressLike, signatureBase58, "solana");
					setIsAuthenticated(true);
					setAuthenticatedAddress(currentAddress);
					hasInitialized.current = true;
				} catch (error) {
					console.error("Failed to authenticate Solana wallet:", error);
					await wallet.disconnect();
					setIsAuthenticated(false);
					setAuthenticatedAddress(null);
				}
			} else if (!currentConnected && prevState.connected) {
				// Only logout if we were previously connected and now disconnected
				console.log("Wallet disconnected, clearing authentication");
				await logOut("solana");
				setIsAuthenticated(false);
				setAuthenticatedAddress(null);
				hasInitialized.current = false;
			}
		}, 500); // 500ms debounce

		// Cleanup timeout on unmount
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, [
		wallet.connected,
		wallet.publicKey,
		wallet.signMessage,
		isAuthenticated,
		authenticatedAddress,
		wallet.disconnect,
	]);

	if (!client || isCheckingAuth) {
		return <Button className="w-full">{isCollapsed ? <Wallet size={16} /> : "Loading..."}</Button>;
	}

	if (!wallet.connected) {
		return (
			<Button
				className="w-full"
				onClick={() => {
					modal.setVisible(true);
				}}
			>
				{isCollapsed ? <Wallet size={16} /> : "Connect"}
			</Button>
		);
	}

	if (isAuthenticated) {
		return (
			<div className="flex w-full gap-2">
				<Button
					className="flex-1"
					variant="outline"
					onClick={() => {
						router.push(`/profile/${wallet.publicKey?.toBase58()}`);
					}}
				>
					{isCollapsed ? <User size={16} /> : "Profile"}
				</Button>
				<Button
					variant="outline"
					onClick={async () => {
						await logOut("solana");
						setIsAuthenticated(false);
						setAuthenticatedAddress(null);
						hasInitialized.current = false;
						// Also disconnect the wallet to show the Connect button
						wallet.disconnect();
					}}
				>
					{isCollapsed ? <LogOut size={16} /> : "Logout"}
				</Button>
			</div>
		);
	}

	return (
		<Button className="w-full" disabled>
			{isCollapsed ? <Wallet size={16} /> : "Connecting..."}
		</Button>
	);
}
