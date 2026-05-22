/**
 * SupplyDistributionPanel - where the 1B token supply actually sits.
 *
 * For a wave-M launch the supply distribution is fully determined by
 * the bundle: instant burn, presaler claim pool, agent treasury, v2 LP.
 * The numbers below are read from chain wherever possible:
 *
 *   - total supply          : `token.totalSupply()`
 *   - burned                : `token.balanceOf(0xdead)` + `balanceOf(0x0)`
 *                             (already exposed via useBurnStats)
 *   - agent treasury        : `token.balanceOf(agentSafe)`
 *   - v2 lp                 : `token.balanceOf(v2Pair)`
 *   - presaler claimable    : `token.balanceOf(launchVault)` (vested 50/50
 *                             over 24h post-launch)
 *
 * Everything is live. Falls back to "—" only when a particular address
 * isn't known on this launch row.
 *
 * Visual: horizontal stacked bar (one bar, segments colored by bucket)
 * + a key beneath. Matches the EconomicsPanel tax-split bar so the
 * grammar carries across the page.
 */
"use client";

import { type Address, formatUnits, isAddress, zeroAddress } from "viem";
import { useReadContracts } from "wagmi";
import { bsc } from "wagmi/chains";

import { SurfaceCard } from "@/components/ui/surface-card";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as Address;
const TOKEN_DECIMALS = 18;

const erc20BalanceAbi = [
	{
		type: "function",
		stateMutability: "view",
		name: "balanceOf",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "totalSupply",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const;

export interface SupplyDistributionPanelProps {
	tokenAddress: string;
	tokenSymbol: string;
	launch: AgentLaunchByToken | null;
}

interface Bucket {
	key: string;
	label: string;
	hint: string;
	balance: bigint;
	tint: string;
}

function fmtAmount(raw: bigint): string {
	const human = Number.parseFloat(formatUnits(raw, TOKEN_DECIMALS));
	if (!Number.isFinite(human) || human === 0) return "0";
	const abs = Math.abs(human);
	if (abs >= 1e9) return `${(human / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `${(human / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `${(human / 1e3).toFixed(2)}k`;
	return human.toFixed(2);
}

function pctOf(part: bigint, whole: bigint): number {
	if (whole === 0n) return 0;
	// avoid bigint -> number precision loss for the percentage scale
	// (we only need 2 decimals, so scale by 10000 first).
	const scaled = Number((part * 10_000n) / whole);
	return scaled / 100;
}

export default function SupplyDistributionPanel({ tokenAddress, tokenSymbol, launch }: SupplyDistributionPanelProps) {
	const tokenValid = isAddress(tokenAddress);
	const token = tokenValid ? (tokenAddress as Address) : null;

	const safe = launch?.agentSafe && isAddress(launch.agentSafe) ? (launch.agentSafe as Address) : null;
	const pair = launch?.v2Pair && isAddress(launch.v2Pair) ? (launch.v2Pair as Address) : null;
	const vault = launch?.vault && isAddress(launch.vault) ? (launch.vault as Address) : null;

	// Build the read list. We always read totalSupply + dead balance; the
	// rest depend on which addresses the launch row exposes.
	const contracts = token
		? [
				{ address: token, abi: erc20BalanceAbi, functionName: "totalSupply" as const, chainId: bsc.id },
				{
					address: token,
					abi: erc20BalanceAbi,
					functionName: "balanceOf" as const,
					args: [DEAD_ADDRESS] as const,
					chainId: bsc.id,
				},
				{
					address: token,
					abi: erc20BalanceAbi,
					functionName: "balanceOf" as const,
					args: [zeroAddress] as const,
					chainId: bsc.id,
				},
				...(safe
					? [
							{
								address: token,
								abi: erc20BalanceAbi,
								functionName: "balanceOf" as const,
								args: [safe] as const,
								chainId: bsc.id,
							},
						]
					: []),
				...(pair
					? [
							{
								address: token,
								abi: erc20BalanceAbi,
								functionName: "balanceOf" as const,
								args: [pair] as const,
								chainId: bsc.id,
							},
						]
					: []),
				...(vault
					? [
							{
								address: token,
								abi: erc20BalanceAbi,
								functionName: "balanceOf" as const,
								args: [vault] as const,
								chainId: bsc.id,
							},
						]
					: []),
			]
		: [];

	const reads = useReadContracts({
		allowFailure: true,
		contracts: contracts as unknown as readonly never[],
		query: {
			enabled: tokenValid && contracts.length > 0,
			refetchInterval: POLL_MS,
			staleTime: 30_000,
		},
	});

	type Row = { status: "success"; result: unknown } | { status: "failure"; error: Error };
	const rows = (reads.data ?? null) as readonly Row[] | null;
	const readBigint = (row: Row | undefined): bigint =>
		row && row.status === "success" && typeof row.result === "bigint" ? row.result : 0n;

	if (!tokenValid) {
		return (
			<SurfaceCard padding="md">
				<div className="font-mono text-[11px] text-white/40">supply data unavailable for this token</div>
			</SurfaceCard>
		);
	}

	let cursor = 0;
	const totalSupply = readBigint(rows?.[cursor++]);
	const deadBal = readBigint(rows?.[cursor++]);
	const zeroBal = readBigint(rows?.[cursor++]);
	const safeBal = safe ? readBigint(rows?.[cursor++]) : 0n;
	const pairBal = pair ? readBigint(rows?.[cursor++]) : 0n;
	const vaultBal = vault ? readBigint(rows?.[cursor++]) : 0n;

	const burned = deadBal + zeroBal;
	// "other" = everything not in burn / treasury / lp / vault. Mostly
	// wallet holders + dust. We surface it so the bar always sums to 100%.
	const accounted = burned + safeBal + pairBal + vaultBal;
	const other = totalSupply > accounted ? totalSupply - accounted : 0n;

	const loading = reads.isLoading && !rows;

	const buckets: Bucket[] = [
		{ key: "burned", label: "burned", hint: "0xdead + 0x0", balance: burned, tint: "bg-[#ff5d4a]" },
		{ key: "treasury", label: "agent safe", hint: "treasury · 2/3 multisig", balance: safeBal, tint: "bg-[#00ff87]" },
		{ key: "lp", label: "v2 lp", hint: "pancakeswap pair", balance: pairBal, tint: "bg-[#5fb0ff]" },
		{
			key: "vault",
			label: "presaler claim",
			hint: "vault · vested 50/50 · 24h",
			balance: vaultBal,
			tint: "bg-[#ffd060]",
		},
		{ key: "other", label: "holders", hint: "all other addresses", balance: other, tint: "bg-white/25" },
	];

	return (
		<SurfaceCard padding="none" className="overflow-hidden">
			<header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 md:px-6">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">supply distribution</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
						{loading ? "loading…" : `${fmtAmount(totalSupply)} ${tokenSymbol.toUpperCase()} total`}
					</span>
				</div>
			</header>

			{loading ? (
				<div className="px-5 py-6 md:px-6">
					<div className="h-6 w-40 animate-pulse rounded-sm bg-white/[0.04]" aria-label="loading supply distribution" />
				</div>
			) : (
				<div className="px-5 py-4 md:px-6">
					{/* Stacked bar */}
					<div
						className="flex h-2 w-full overflow-hidden rounded-sm border border-white/[0.06]"
						aria-label="supply distribution bar"
					>
						{buckets.map((b) => {
							const pct = pctOf(b.balance, totalSupply);
							if (pct <= 0) return null;
							return (
								<div
									key={b.key}
									className={cn("h-full", b.tint)}
									style={{ width: `${pct}%` }}
									title={`${b.label}: ${pct.toFixed(2)}%`}
								/>
							);
						})}
					</div>

					{/* Key */}
					<dl className="mt-4 grid gap-3 sm:grid-cols-2">
						{buckets.map((b) => {
							const pct = pctOf(b.balance, totalSupply);
							if (b.key === "other" && pct < 0.1) return null;
							return (
								<div key={b.key} className="flex items-center gap-3">
									<span className={cn("inline-block h-2 w-2 rounded-sm shrink-0", b.tint)} aria-hidden />
									<div className="flex flex-1 items-baseline justify-between gap-3 min-w-0">
										<dt className="flex flex-col gap-0.5 min-w-0">
											<span className="font-mono text-[11px] text-white/75 truncate">{b.label}</span>
											<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30 truncate">
												{b.hint}
											</span>
										</dt>
										<dd className="flex flex-col items-end gap-0.5 shrink-0">
											<span className="font-mono text-[12px] tabular-nums text-white/85">{fmtAmount(b.balance)}</span>
											<span className="font-mono text-[10px] tabular-nums text-white/45">{pct.toFixed(2)}%</span>
										</dd>
									</div>
								</div>
							);
						})}
					</dl>
				</div>
			)}
		</SurfaceCard>
	);
}
