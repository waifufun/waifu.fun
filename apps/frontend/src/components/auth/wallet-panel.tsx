"use client";

import { cn } from "@/lib/utils";
import { useAuth as useStewardAuth } from "@stwd/react";
import type { StewardAuthResult } from "@stwd/sdk";
import { Loader2, Wallet } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";

interface WalletPanelProps {
	onSuccess?: (result: StewardAuthResult, kind: "evm") => void;
	onError?: (error: Error, kind: "evm") => void;
}

// Friendly display names for known connector ids. RainbowKit-wrapped
// wallets already report nice names via `connector.name`, but we
// canonicalize the brand strings here so capitalization stays exact
// regardless of upstream changes.
const FRIENDLY_NAME: Record<string, string> = {
	metaMask: "MetaMask",
	metaMaskSDK: "MetaMask",
	metaMaskWallet: "MetaMask",
	coinbaseWallet: "Coinbase Wallet",
	coinbaseWalletSDK: "Coinbase Wallet",
	walletConnect: "WalletConnect",
};

function displayName(connector: Connector): string {
	const friendly = FRIENDLY_NAME[connector.id];
	if (friendly) return friendly;
	// For the generic injected connector, RainbowKit names it after the
	// detected wallet ("Rabby", "Brave Wallet", "Frame", etc). Pass it
	// through. If it has no name, label it generically.
	if (connector.id === "injected") {
		return connector.name && connector.name.length > 0 ? connector.name : "Browser Wallet";
	}
	return connector.name;
}

// RainbowKit-wrapped connectors expose `rkDetails` with `iconUrl`
// (sometimes a thunk) and an `iconBackground`. Plain wagmi
// connectors expose `icon` as a data URL string. We probe both
// without importing RainbowKit, which the allowlist forbids.
function readIconFromConnector(connector: Connector): string | null {
	const direct = (connector as unknown as { icon?: string }).icon;
	if (typeof direct === "string" && direct.length > 0) return direct;

	const rk = (connector as unknown as { rkDetails?: { iconUrl?: string | (() => string) } }).rkDetails;
	if (!rk) return null;
	const iconUrl = rk.iconUrl;
	if (typeof iconUrl === "string") return iconUrl;
	return null;
}

function ConnectorIcon({ connector }: { connector: Connector }) {
	const [src] = useState<string | null>(() => readIconFromConnector(connector));
	const [errored, setErrored] = useState(false);
	if (!src || errored) {
		return <Wallet className="size-[18px] shrink-0 text-[#a1a1aa]" aria-hidden="true" />;
	}
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={src}
			alt=""
			width={18}
			height={18}
			className="size-[18px] shrink-0 rounded-none object-contain"
			onError={() => setErrored(true)}
		/>
	);
}

function truncateAddress(addr: string): string {
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// We hide the bare `injected` connector ONLY when its detected provider
// is the same wallet we already show as a dedicated row (MetaMask or
// Coinbase). Otherwise the user has Rabby, Brave, Trust, Frame, or
// another non-MetaMask/Coinbase injected provider and we must keep the
// row visible: it is the only sign-in path for them.
//
// Detection: RainbowKit names the injected connector after the detected
// wallet ("MetaMask", "Coinbase Wallet"). If the injected connector's
// name does not match an existing dedicated row, we keep it (renamed to
// just "Browser Wallet" via the friendly map fallback below).
function dedupeConnectors(connectors: readonly Connector[]): Connector[] {
	const hasMetaMaskRow = connectors.some(
		(c) => c.id === "metaMask" || c.id === "metaMaskSDK" || c.id === "metaMaskWallet",
	);
	const hasCoinbaseRow = connectors.some((c) => c.id === "coinbaseWallet" || c.id === "coinbaseWalletSDK");
	const filtered = connectors.filter((c) => {
		if (c.id !== "injected") return true;
		const name = (c.name ?? "").toLowerCase();
		const isMetaMaskInjected = name.includes("metamask");
		const isCoinbaseInjected = name.includes("coinbase");
		if (hasMetaMaskRow && isMetaMaskInjected) return false;
		if (hasCoinbaseRow && isCoinbaseInjected) return false;
		return true;
	});
	// Stable rank: MetaMask, Coinbase, WalletConnect, then everything else.
	const rank = (id: string): number => {
		if (id === "metaMask" || id === "metaMaskSDK" || id === "metaMaskWallet") return 0;
		if (id === "coinbaseWallet" || id === "coinbaseWalletSDK") return 1;
		if (id === "walletConnect") return 2;
		return 10;
	};
	return [...filtered].sort((a, b) => rank(a.id) - rank(b.id));
}

export function WalletPanel({ onSuccess, onError }: WalletPanelProps) {
	const auth = useStewardAuth();
	const { address, isConnected, chain, connector: activeConnector } = useAccount();
	const { connectors, connectAsync, isPending: connectPending, variables: connectVariables } = useConnect();
	const { disconnect } = useDisconnect();
	const { signMessageAsync } = useSignMessage();
	const [signing, setSigning] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const visibleConnectors = useMemo(() => dedupeConnectors(connectors), [connectors]);

	const handleConnect = useCallback(
		async (connector: Connector) => {
			setError(null);
			try {
				await connectAsync({ connector });
			} catch (err) {
				const message = err instanceof Error ? err.message : "could not connect";
				setError(message);
				if (err instanceof Error) onError?.(err, "evm");
			}
		},
		[connectAsync, onError],
	);

	const handleSign = useCallback(async () => {
		setError(null);
		if (!address) {
			const err = new Error("no wallet connected");
			setError(err.message);
			onError?.(err, "evm");
			return;
		}
		setSigning(true);
		try {
			const result = await auth.signInWithSIWE(address, async (msg: string) => {
				return await signMessageAsync({ message: msg });
			});
			onSuccess?.(result, "evm");
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			setError(err.message || "sign-in failed");
			onError?.(err, "evm");
		} finally {
			setSigning(false);
		}
	}, [address, auth, onError, onSuccess, signMessageAsync]);

	if (isConnected && address) {
		const walletName = activeConnector ? displayName(activeConnector) : "wallet";
		return (
			<div className="flex flex-col gap-3">
				<div
					className={cn(
						"flex items-center justify-between gap-3 border border-white/10 bg-[#0b0b0d] px-3.5 py-3",
						"text-[13px] text-[#e4e4e7]",
					)}
					data-testid="wallet-panel-connected-row"
				>
					<span className="font-mono">{truncateAddress(address)}</span>
					{chain?.name ? (
						<span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#71717a]">on {chain.name}</span>
					) : null}
				</div>

				<button
					type="button"
					onClick={handleSign}
					disabled={signing}
					className={cn(
						"flex w-full items-center justify-center gap-2 bg-[#00ff87] px-4 py-2.5",
						"text-[13px] font-medium text-[#08080a] transition-opacity hover:opacity-90 disabled:opacity-50",
					)}
					data-testid="wallet-panel-sign-btn"
				>
					{signing ? (
						<>
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							<span>signing</span>
						</>
					) : (
						<span>sign in with {walletName}</span>
					)}
				</button>

				<button
					type="button"
					onClick={() => {
						setError(null);
						disconnect();
					}}
					disabled={signing}
					className={cn(
						"text-center text-[11px] font-mono uppercase tracking-[0.18em] text-[#71717a]",
						"transition-colors hover:text-[#e4e4e7] disabled:opacity-50",
					)}
				>
					disconnect
				</button>

				{error ? <p className="text-center text-[11px] text-[#f87171]">{error}</p> : null}
			</div>
		);
	}

	if (visibleConnectors.length === 0) {
		return (
			<div className="border border-white/10 bg-[#0b0b0d] px-3.5 py-4 text-center text-[12px] text-[#71717a]">
				no wallet connectors available
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{visibleConnectors.map((connector) => {
				const pendingThis = connectPending && connectVariables?.connector === connector;
				return (
					<button
						key={connector.uid ?? connector.id}
						type="button"
						onClick={() => {
							void handleConnect(connector);
						}}
						disabled={connectPending}
						className={cn(
							"flex w-full items-center gap-3 border border-white/10 bg-[#0b0b0d] px-3.5 py-3",
							"text-[13px] text-[#e4e4e7] transition-colors",
							"hover:border-white/25 hover:bg-[#0e0e11] disabled:opacity-50",
						)}
						data-testid={`wallet-panel-connector-${connector.id}`}
					>
						<ConnectorIcon connector={connector} />
						<span className="flex-1 text-left">{displayName(connector)}</span>
						{pendingThis ? <Loader2 className="size-4 animate-spin text-[#a1a1aa]" aria-hidden="true" /> : null}
					</button>
				);
			})}
			{error ? <p className="mt-1 text-center text-[11px] text-[#f87171]">{error}</p> : null}
		</div>
	);
}
