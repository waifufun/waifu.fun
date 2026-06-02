"use client";

import { Input } from "@/components/ui/input";
import {
	type PolicyRule,
	type TradingPolicyCaps,
	findWithdrawWhitelist,
	isLikelyEvmAddress,
	setWithdrawWhitelist,
	useTradingPolicies,
	useTradingPolicy,
	useUpdateTradingPolicies,
	useUpdateTradingPolicy,
} from "@/lib/api/trading-policy";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type Props = { agentId: string };

// Assets and venues the agent can be allow-listed onto. Kept lowercase TPOT in
// the labels, uppercase as the canonical token symbol we send to Steward.
const ASSETS: { symbol: string; label: string }[] = [
	{ symbol: "BTC", label: "btc" },
	{ symbol: "ETH", label: "eth" },
	{ symbol: "BNB", label: "bnb" },
	{ symbol: "SOL", label: "sol" },
	{ symbol: "HYPE", label: "hype" },
	{ symbol: "USDC", label: "usdc" },
	{ symbol: "USDT", label: "usdt" },
];

const VENUES: { slug: string; label: string }[] = [
	{ slug: "pancake", label: "pancakeswap" },
	{ slug: "venus", label: "venus" },
	{ slug: "aster", label: "aster" },
	{ slug: "hyperliquid", label: "hyperliquid" },
	{ slug: "polymarket", label: "polymarket" },
];

const PANEL = "rounded-sm border border-stroke-strong bg-[#0C0C0C]";

// ── small atoms ───────────────────────────────────────────────────

function CapInput({
	id,
	label,
	hint,
	suffix,
	value,
	onChange,
	disabled,
}: {
	id: string;
	label: string;
	hint?: string;
	suffix?: string;
	value: string;
	onChange: (v: string) => void;
	disabled?: boolean;
}) {
	return (
		<div>
			<label htmlFor={id} className="block font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 mb-1.5">
				{label}
			</label>
			<div className="relative">
				<Input
					id={id}
					type="number"
					inputMode="decimal"
					min={0}
					step="any"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					placeholder="unset"
					className={cn(suffix && "pr-14")}
				/>
				{suffix ? (
					<span
						aria-hidden
						className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-wide text-neutral-500"
					>
						{suffix}
					</span>
				) : null}
			</div>
			{hint ? <p className="mt-1 font-mono text-[10px] text-neutral-600">{hint}</p> : null}
		</div>
	);
}

function Chip({
	active,
	disabled,
	onClick,
	children,
}: {
	active: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"rounded-sm border px-3 py-1.5 font-mono text-[11px] lowercase tracking-wide transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
				disabled && "opacity-40 cursor-not-allowed",
				active
					? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
					: "border-stroke bg-[#0A0A0A] text-neutral-400 hover:border-stroke-strong hover:text-neutral-200",
			)}
		>
			{children}
		</button>
	);
}

function SaveButton({
	onClick,
	saving,
	disabled,
	saved,
	label = "save",
}: {
	onClick: () => void;
	saving: boolean;
	disabled?: boolean;
	saved?: boolean;
	label?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={saving || disabled}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
				saving || disabled
					? "border-stroke bg-neutral-900 text-neutral-600 cursor-not-allowed"
					: "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20",
			)}
		>
			{saving ? "saving" : saved ? "saved" : label}
		</button>
	);
}

function numToInput(n: number | null | undefined): string {
	return n == null ? "" : String(n);
}

function inputToNum(v: string): number | null {
	if (v.trim() === "") return null;
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

// ── caps + allow-lists panel ──────────────────────────────────────

function CapsPanel({ agentId }: { agentId: string }) {
	const { caps, isLoading, error, notFound } = useTradingPolicy(agentId);
	const update = useUpdateTradingPolicy(agentId);

	const [daily, setDaily] = useState("");
	const [perOrder, setPerOrder] = useState("");
	const [leverage, setLeverage] = useState("");
	const [assets, setAssets] = useState<string[]>([]);
	const [venues, setVenues] = useState<string[]>([]);
	const [saved, setSaved] = useState(false);
	const [localErr, setLocalErr] = useState<string | null>(null);

	// Hydrate from server, re-syncing when the payload changes.
	const sig = useMemo(
		() =>
			JSON.stringify([
				caps.dailyCap ?? null,
				caps.perOrderCap ?? null,
				caps.leverageCap ?? null,
				caps.allowedAssets ?? [],
				caps.allowedVenues ?? [],
			]),
		[caps],
	);
	const [lastSig, setLastSig] = useState<string | null>(null);
	if (!isLoading && sig !== lastSig) {
		setLastSig(sig);
		setDaily(numToInput(caps.dailyCap));
		setPerOrder(numToInput(caps.perOrderCap));
		setLeverage(numToInput(caps.leverageCap));
		setAssets(caps.allowedAssets ?? []);
		setVenues(caps.allowedVenues ?? []);
	}

	useEffect(() => {
		if (!saved) return;
		const t = window.setTimeout(() => setSaved(false), 2000);
		return () => window.clearTimeout(t);
	}, [saved]);

	const toggleAsset = (symbol: string) =>
		setAssets((prev) => (prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]));
	const toggleVenue = (slug: string) =>
		setVenues((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

	async function save() {
		setLocalErr(null);
		const next: TradingPolicyCaps = {
			dailyCap: inputToNum(daily),
			perOrderCap: inputToNum(perOrder),
			leverageCap: inputToNum(leverage),
			allowedAssets: assets,
			allowedVenues: venues,
		};
		try {
			await update.mutateAsync(next);
			setSaved(true);
		} catch (e) {
			setLocalErr((e as Error).message || "couldn't save");
		}
	}

	if (notFound) {
		return (
			<div className="px-4 py-6">
				<p className="font-mono text-[11px] text-neutral-500">
					caps are not available for this agent yet. they show up once the runtime is provisioned.
				</p>
			</div>
		);
	}

	return (
		<div className="px-4 py-4 space-y-5">
			{isLoading ? (
				<div className="space-y-3 animate-pulse" aria-hidden>
					<div className="h-11 w-full rounded bg-[#141414]" />
					<div className="h-11 w-full rounded bg-[#141414]" />
				</div>
			) : (
				<>
					{error ? (
						<p role="alert" className="font-mono text-[11px] text-[var(--negative)]">
							couldn't load caps. {error.message}
						</p>
					) : null}

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<CapInput
							id="daily-cap"
							label="daily cap"
							hint="max spend per 24h"
							suffix="usd"
							value={daily}
							onChange={setDaily}
							disabled={update.isPending}
						/>
						<CapInput
							id="per-order-cap"
							label="per-order cap"
							hint="max size of one order"
							suffix="usd"
							value={perOrder}
							onChange={setPerOrder}
							disabled={update.isPending}
						/>
						<CapInput
							id="leverage-cap"
							label="leverage cap"
							hint="max leverage on perps"
							suffix="x"
							value={leverage}
							onChange={setLeverage}
							disabled={update.isPending}
						/>
					</div>

					<div>
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 mb-2">allowed assets</p>
						<div className="flex flex-wrap gap-2">
							{ASSETS.map((a) => (
								<Chip
									key={a.symbol}
									active={assets.includes(a.symbol)}
									disabled={update.isPending}
									onClick={() => toggleAsset(a.symbol)}
								>
									{a.label}
								</Chip>
							))}
						</div>
						<p className="mt-1.5 font-mono text-[10px] text-neutral-600">
							empty = no asset restriction. select to limit what it can hold.
						</p>
					</div>

					<div>
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 mb-2">allowed venues</p>
						<div className="flex flex-wrap gap-2">
							{VENUES.map((v) => (
								<Chip
									key={v.slug}
									active={venues.includes(v.slug)}
									disabled={update.isPending}
									onClick={() => toggleVenue(v.slug)}
								>
									{v.label}
								</Chip>
							))}
						</div>
						<p className="mt-1.5 font-mono text-[10px] text-neutral-600">
							empty = no venue restriction. select to limit where it can trade.
						</p>
					</div>

					{localErr ? (
						<p role="alert" className="font-mono text-[11px] text-[var(--negative)]">
							{localErr}
						</p>
					) : null}

					<div className="flex items-center justify-end">
						<SaveButton onClick={save} saving={update.isPending} saved={saved} label="save caps" />
					</div>
				</>
			)}
		</div>
	);
}

// ── withdraw whitelist (money-safety gate) ────────────────────────

function WithdrawWhitelistPanel({ agentId }: { agentId: string }) {
	const { rules, isLoading, error, notFound } = useTradingPolicies(agentId);
	const update = useUpdateTradingPolicies(agentId);

	const [addresses, setAddresses] = useState<string[]>([]);
	const [draft, setDraft] = useState("");
	const [draftErr, setDraftErr] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [localErr, setLocalErr] = useState<string | null>(null);

	const whitelist = useMemo(() => findWithdrawWhitelist(rules), [rules]);
	const serverSig = useMemo(() => JSON.stringify(whitelist?.addresses ?? []), [whitelist]);
	const [lastSig, setLastSig] = useState<string | null>(null);
	if (!isLoading && serverSig !== lastSig) {
		setLastSig(serverSig);
		setAddresses(whitelist?.addresses ?? []);
	}

	useEffect(() => {
		if (!saved) return;
		const t = window.setTimeout(() => setSaved(false), 2000);
		return () => window.clearTimeout(t);
	}, [saved]);

	function addDraft() {
		const addr = draft.trim();
		setDraftErr(null);
		if (!addr) return;
		if (!isLikelyEvmAddress(addr)) {
			setDraftErr("that doesn't look like a valid 0x address");
			return;
		}
		if (addresses.some((a) => a.toLowerCase() === addr.toLowerCase())) {
			setDraftErr("already on the list");
			return;
		}
		setAddresses((prev) => [...prev, addr]);
		setDraft("");
	}

	function removeAddr(addr: string) {
		setAddresses((prev) => prev.filter((a) => a !== addr));
	}

	async function save() {
		setLocalErr(null);
		const nextRules: PolicyRule[] = setWithdrawWhitelist(rules, addresses);
		try {
			await update.mutateAsync(nextRules);
			setSaved(true);
		} catch (e) {
			setLocalErr((e as Error).message || "couldn't save");
		}
	}

	const dirty = serverSig !== JSON.stringify(addresses);

	if (notFound) {
		return (
			<div className="px-4 py-6">
				<p className="font-mono text-[11px] text-neutral-500">
					the withdraw whitelist is not available for this agent yet.
				</p>
			</div>
		);
	}

	return (
		<div className="px-4 py-4 space-y-4">
			<div className="rounded-sm border border-[var(--accent)]/25 bg-[var(--accent)]/[0.04] px-3 py-2.5">
				<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">money-safety gate</p>
				<p className="mt-1 font-mono text-[11px] leading-relaxed text-neutral-300 max-w-[60ch]">
					funds can only ever withdraw to addresses on this list. leave it empty and no outbound transfer is allowed.
					this is the hard ceiling on where the agent's money can go.
				</p>
			</div>

			{isLoading ? (
				<div className="space-y-2 animate-pulse" aria-hidden>
					<div className="h-9 w-full rounded bg-[#141414]" />
					<div className="h-9 w-2/3 rounded bg-[#141414]" />
				</div>
			) : (
				<>
					{error ? (
						<p role="alert" className="font-mono text-[11px] text-[var(--negative)]">
							couldn't load the whitelist. {error.message}
						</p>
					) : null}

					{addresses.length === 0 ? (
						<p className="rounded-sm border border-dashed border-stroke px-3 py-4 text-center font-mono text-[11px] text-neutral-500">
							no approved addresses. withdrawals are blocked until you add one.
						</p>
					) : (
						<ul className="space-y-1.5">
							{addresses.map((addr) => (
								<li
									key={addr}
									className="flex items-center gap-2 rounded-sm border border-stroke bg-[#0A0A0A] px-3 py-2"
								>
									<span className="font-mono text-[11px] text-neutral-200 break-all flex-1 min-w-0">{addr}</span>
									<button
										type="button"
										onClick={() => removeAddr(addr)}
										disabled={update.isPending}
										aria-label={`remove ${addr}`}
										className="shrink-0 rounded-sm border border-stroke px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-neutral-400 transition-colors hover:border-[var(--negative)]/40 hover:text-[var(--negative)] disabled:opacity-40"
									>
										remove
									</button>
								</li>
							))}
						</ul>
					)}

					<div>
						<div className="flex items-stretch gap-2">
							<Input
								value={draft}
								onChange={(e) => {
									setDraft(e.target.value);
									if (draftErr) setDraftErr(null);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										addDraft();
									}
								}}
								placeholder="0x… approved withdraw address"
								disabled={update.isPending}
								className="flex-1 font-mono text-[12px]"
								aria-label="new approved withdraw address"
							/>
							<button
								type="button"
								onClick={addDraft}
								disabled={update.isPending || draft.trim().length === 0}
								className="shrink-0 rounded-sm border border-stroke-strong px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-200 transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
							>
								add
							</button>
						</div>
						{draftErr ? (
							<p role="alert" className="mt-1.5 font-mono text-[10px] text-[var(--negative)]">
								{draftErr}
							</p>
						) : null}
					</div>

					{localErr ? (
						<p role="alert" className="font-mono text-[11px] text-[var(--negative)]">
							{localErr}
						</p>
					) : null}

					<div className="flex items-center justify-between gap-2">
						<span className="font-mono text-[10px] text-neutral-600">
							{dirty ? "unsaved changes" : "in sync with the agent"}
						</span>
						<SaveButton
							onClick={save}
							saving={update.isPending}
							saved={saved}
							disabled={!dirty}
							label="save whitelist"
						/>
					</div>
				</>
			)}
		</div>
	);
}

// ── shell ─────────────────────────────────────────────────────────

export default function TradingPolicyEditor({ agentId }: Props) {
	return (
		<section aria-label="Trading policy" className={cn(PANEL)}>
			<header className="flex items-center justify-between border-b border-stroke px-4 py-3">
				<div className="flex items-center gap-2">
					<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">trading policy</h2>
				</div>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">owner-only</span>
			</header>

			<p className="border-b border-stroke px-4 py-2.5 font-mono text-[10px] leading-relaxed text-neutral-500 max-w-[68ch]">
				these guardrails are yours alone. the agent cannot change its own caps or withdraw list. writes are
				authorized with your owner session.
			</p>

			<div className="grid grid-cols-1">
				<div className="border-b border-stroke">
					<div className="px-4 pt-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">caps + allow-lists</p>
					</div>
					<CapsPanel agentId={agentId} />
				</div>
				<div>
					<div className="px-4 pt-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">withdraw whitelist</p>
					</div>
					<WithdrawWhitelistPanel agentId={agentId} />
				</div>
			</div>
		</section>
	);
}
