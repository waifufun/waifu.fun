/**
 * Provenance panel for the agent home page.
 *
 * Surfaces the agent's ERC-8004 on-chain identity. Renders nothing
 * when `identity` is null (most agents won't have an identity day one
 * and that is the correct default).
 *
 * Layout:
 *   - Single Panel wrapper (wave-T grammar).
 *   - 2-col on lg+: identity facts left, registration-file preview
 *     right. Single column below lg.
 *   - All numbers / hashes in mono. All labels uppercase mono.
 *
 * Honesty notes:
 *   - Addresses + tx hashes show truncated text but copy the full
 *     value. Title attr exposes the full value for power users.
 *   - When the registration file fetch fails, the preview shows an
 *     honest "registration file unavailable" line — never a fake or
 *     stale JSON dump.
 *   - The "view raw JSON" button is the only way the full file is
 *     rendered (modal). Avoids leaking 2KB of metadata into the
 *     scannable surface.
 */

"use client";

import { Check, Copy, ExternalLink, FileTextIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import {
	build8004ScanUrl,
	buildScanAddressUrl,
	buildScanTxUrl,
	fetchRegistrationFile,
	ipfsToGateway,
} from "@/lib/erc8004/client";
import type { Erc8004IdentityRecord, Erc8004RegistrationFile } from "@/lib/erc8004/types";
import { cn } from "@/lib/utils";

import { Label, Panel, StatPill } from "./wave-t/_primitives";

interface ProvenancePanelProps {
	identity: Erc8004IdentityRecord | null;
	/** When true, swap the panel headline to the first-agent variant. */
	isFirstWaifuAgent?: boolean;
}

export function ProvenancePanel({ identity, isFirstWaifuAgent }: ProvenancePanelProps) {
	if (!identity) return null;

	const headline = pickHeadline(identity, isFirstWaifuAgent ?? identity.firstWaifuAgent ?? false);
	const dateStr = formatDate(identity.registeredAt);

	return (
		<Panel className="scroll-mt-4" noPad>
			<div id="provenance" aria-hidden="true" />
			<div className="p-4 md:p-5">
				<Label right={<StatPill tone="accent">{identity.chain === "bsc" ? "bsc mainnet" : identity.chain}</StatPill>}>
					{headline}
				</Label>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-5">
					<IdentityFacts identity={identity} dateStr={dateStr} />
					<RegistrationPreview identity={identity} />
				</div>
			</div>
		</Panel>
	);
}

// ── Identity facts ─────────────────────────────────────────────

function IdentityFacts({ identity, dateStr }: { identity: Erc8004IdentityRecord; dateStr: string }) {
	const ownerScan = buildScanAddressUrl(identity, identity.ownerWalletAddress);
	const txScan = buildScanTxUrl(identity);
	const scan8004 = build8004ScanUrl(identity);
	const ipfsGateway = ipfsToGateway(identity.metadataIpfsUri);

	return (
		<div className="flex flex-col divide-y divide-[var(--border-soft)]">
			<FactRow label="standard" value="erc-8004" mono />
			<FactRow label="agent id" value={`#${identity.tokenId}`} mono accent />
			<FactRow
				label="registry"
				value={truncateAddress(identity.registryAddress)}
				copyValue={identity.registryAddress}
				href={buildScanAddressUrl(identity, identity.registryAddress)}
				mono
			/>
			<FactRow
				label="owner wallet"
				value={truncateAddress(identity.ownerWalletAddress)}
				copyValue={identity.ownerWalletAddress}
				href={ownerScan}
				mono
				hint="steward managed"
			/>
			<FactRow
				label="registration tx"
				value={truncateHash(identity.txHash)}
				copyValue={identity.txHash}
				href={txScan}
				mono
			/>
			<FactRow label="registered" value={dateStr} mono />
			<FactRow
				label="https uri"
				value={identity.metadataHttpsUrl ? truncateUrl(identity.metadataHttpsUrl) : "not mirrored"}
				copyValue={identity.metadataHttpsUrl ?? null}
				href={identity.metadataHttpsUrl ?? null}
				mono
			/>
			<FactRow
				label="ipfs uri"
				value={identity.metadataIpfsUri ? truncateIpfs(identity.metadataIpfsUri) : "not pinned"}
				copyValue={identity.metadataIpfsUri ?? null}
				href={ipfsGateway}
				mono
			/>
			<div className="flex flex-wrap items-center gap-2 pt-4">
				<RawJsonButton identity={identity} />
				<a
					href={scan8004}
					target="_blank"
					rel="noopener noreferrer"
					className={cn(
						"inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5",
						"border-[var(--border-mid)] bg-[var(--bg-panel-hi)]",
						"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]",
						"transition-colors hover:border-[rgba(0,255,135,0.3)] hover:text-[var(--text-primary)]",
					)}
				>
					view on 8004scan
					<ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
				</a>
			</div>
		</div>
	);
}

// ── Single fact row ────────────────────────────────────────────

function FactRow({
	label,
	value,
	copyValue,
	href,
	mono = false,
	accent = false,
	hint,
}: {
	label: string;
	value: string;
	copyValue?: string | null;
	href?: string | null;
	mono?: boolean;
	accent?: boolean;
	hint?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 py-2.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] shrink-0">
				{label}
			</span>
			<div className="flex min-w-0 items-center justify-end gap-2">
				<span
					title={copyValue ?? value}
					className={cn(
						"truncate text-right tabular-nums",
						mono ? "font-mono text-[12px]" : "text-[13px]",
						accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
					)}
				>
					{value}
				</span>
				{hint ? (
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] shrink-0">
						{hint}
					</span>
				) : null}
				{copyValue ? <CopyButton value={copyValue} ariaLabel={`copy ${label}`} /> : null}
				{href ? (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={`open ${label} in new tab`}
						className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-hi)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
					>
						<ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
					</a>
				) : null}
			</div>
		</div>
	);
}

function CopyButton({ value, ariaLabel }: { value: string; ariaLabel: string }) {
	const [copied, setCopied] = useState(false);
	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			/* clipboard may be unavailable; silent */
		}
	}, [value]);
	return (
		<button
			type="button"
			onClick={copy}
			aria-label={copied ? `${ariaLabel} copied` : ariaLabel}
			className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-hi)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
		>
			{copied ? (
				<Check className="h-3 w-3 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
			) : (
				<Copy className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
			)}
		</button>
	);
}

// ── Registration file preview ──────────────────────────────────

function RegistrationPreview({ identity }: { identity: Erc8004IdentityRecord }) {
	const [file, setFile] = useState<Erc8004RegistrationFile | null>(null);
	const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

	useEffect(() => {
		let cancelled = false;
		setStatus("loading");
		fetchRegistrationFile(identity).then((res) => {
			if (cancelled) return;
			if (res) {
				setFile(res);
				setStatus("ok");
			} else {
				setStatus("error");
			}
		});
		return () => {
			cancelled = true;
		};
	}, [identity]);

	return (
		<div className="flex flex-col gap-3 rounded-sm border border-[var(--border-soft)] bg-[var(--bg-panel-hi)] p-3">
			<div className="flex items-center justify-between">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					registration file
				</span>
				<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					{status === "loading" ? "fetching" : status === "ok" ? "pinned" : "unavailable"}
				</span>
			</div>
			{status === "ok" && file ? (
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-[11px] tabular-nums">
					<dt className="text-[var(--text-tertiary)] uppercase tracking-[0.18em] text-[9px] self-center">name</dt>
					<dd className="truncate text-[var(--text-primary)]" title={String(file.name)}>
						{String(file.name ?? "").toLowerCase()}
					</dd>
					<dt className="text-[var(--text-tertiary)] uppercase tracking-[0.18em] text-[9px] self-center">type</dt>
					<dd className="truncate text-[var(--text-secondary)]" title={String(file.type)}>
						{shortType(String(file.type ?? ""))}
					</dd>
					<dt className="text-[var(--text-tertiary)] uppercase tracking-[0.18em] text-[9px] self-center">active</dt>
					<dd className="text-[var(--text-secondary)]">{file.active ? "true" : "false"}</dd>
					<dt className="text-[var(--text-tertiary)] uppercase tracking-[0.18em] text-[9px] self-start pt-0.5">
						services
					</dt>
					<dd className="flex flex-wrap gap-1">
						{(file.services ?? []).slice(0, 6).map((svc) => (
							<span
								key={`${svc.name}-${svc.endpoint}`}
								className="inline-flex items-center rounded-sm border border-[var(--border-soft)] bg-[var(--bg-panel)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]"
								title={svc.endpoint}
							>
								{svc.name.toLowerCase()}
							</span>
						))}
						{(file.services?.length ?? 0) === 0 ? (
							<span className="text-[var(--text-tertiary)]">no services</span>
						) : null}
					</dd>
					<dt className="text-[var(--text-tertiary)] uppercase tracking-[0.18em] text-[9px] self-center">trust</dt>
					<dd className="truncate text-[var(--text-secondary)]">
						{(file.supportedTrust ?? []).join(", ") || "none declared"}
					</dd>
				</dl>
			) : status === "loading" ? (
				<p className="font-mono text-[11px] text-[var(--text-tertiary)]">resolving agent uri</p>
			) : (
				<p className="font-mono text-[11px] text-[var(--text-tertiary)]">
					registration file unavailable. on-chain record stands; mirror or gateway may be flaky.
				</p>
			)}
		</div>
	);
}

// ── Raw JSON modal ─────────────────────────────────────────────

function RawJsonButton({ identity }: { identity: Erc8004IdentityRecord }) {
	const [open, setOpen] = useState(false);
	const [file, setFile] = useState<Erc8004RegistrationFile | null>(null);
	const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

	const dialogId = useId();

	useEffect(() => {
		if (!open) return;
		setStatus("loading");
		fetchRegistrationFile(identity).then((res) => {
			if (res) {
				setFile(res);
				setStatus("ok");
			} else {
				setStatus("error");
			}
		});
	}, [open, identity]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5",
					"border-[var(--border-mid)] bg-[var(--bg-panel-hi)]",
					"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]",
					"transition-colors hover:border-[rgba(0,255,135,0.3)] hover:text-[var(--text-primary)]",
					"focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
				)}
			>
				<FileTextIcon className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
				view raw json
			</button>
			{open ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby={`${dialogId}-title`}
					className="fixed inset-0 z-50 flex items-center justify-center p-4"
				>
					<button
						type="button"
						aria-label="close dialog"
						onClick={() => setOpen(false)}
						className="absolute inset-0 bg-black/70 cursor-default focus:outline-none"
					/>
					<div className="relative w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-md border border-[var(--border-mid)] bg-[var(--bg-panel)]">
						<header className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
							<span
								id={`${dialogId}-title`}
								className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]"
							>
								registration file · agent #{identity.tokenId}
							</span>
							<button
								type="button"
								onClick={() => setOpen(false)}
								aria-label="close"
								className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-hi)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
							>
								<XIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
							</button>
						</header>
						<div className="overflow-auto p-4 max-h-[calc(80vh-48px)]">
							{status === "loading" ? (
								<p className="font-mono text-[11px] text-[var(--text-tertiary)]">fetching agent uri</p>
							) : status === "ok" && file ? (
								<pre className="font-mono text-[11px] leading-[1.55] text-[var(--text-primary)] whitespace-pre-wrap break-words">
									{JSON.stringify(file, null, 2)}
								</pre>
							) : (
								<p className="font-mono text-[11px] text-[var(--text-tertiary)]">
									registration file unavailable. the on-chain record stands.
								</p>
							)}
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}

// ── helpers ────────────────────────────────────────────────────

function pickHeadline(identity: Erc8004IdentityRecord, isFirstWaifuAgent: boolean): string {
	// Rationale (recorded in the brief): for Sol specifically, the
	// "first verified agent on waifu.fun" headline is true exactly once
	// and is worth surfacing for launch-week storytelling. For every
	// other agent, the evergreen "on-chain identity" headline keeps the
	// label honest. We deliberately do NOT use "provenance" because the
	// term reads as art-world jargon, not trader grammar.
	if (isFirstWaifuAgent) return "first verified agent on waifu.fun";
	return "on-chain identity";
}

function truncateAddress(addr: string): string {
	if (!addr) return "";
	const clean = addr.startsWith("0x") ? addr : `0x${addr}`;
	return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

function truncateHash(hash: string): string {
	if (!hash) return "";
	return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function truncateUrl(url: string, max = 36): string {
	if (url.length <= max) return url;
	const start = url.slice(0, Math.floor(max / 2));
	const end = url.slice(-Math.floor(max / 2));
	return `${start}…${end}`;
}

function truncateIpfs(uri: string): string {
	if (uri.length <= 32) return uri;
	const cid = uri.slice("ipfs://".length);
	return `ipfs://${cid.slice(0, 8)}…${cid.slice(-6)}`;
}

function shortType(t: string): string {
	if (!t) return "";
	const idx = t.lastIndexOf("#");
	if (idx > 0) return t.slice(idx + 1);
	return t.length > 32 ? `…${t.slice(-30)}` : t;
}

function formatDate(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).toLowerCase();
	} catch {
		return iso;
	}
}
