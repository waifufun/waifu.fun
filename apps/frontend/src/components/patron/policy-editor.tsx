"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
	FALLBACK_TEMPLATES,
	useAdapterPolicies,
	useUpdateAdapterPolicy,
	type AdapterPolicy,
	type AdapterTemplate,
} from "@/lib/api/adapter-policies";

type Props = {
	agentId: string;
};

/**
 * Stable row order. Keeps the UI deterministic regardless of what the API
 * returns (missing slugs fall back to templates).
 */
const ADAPTER_ORDER: string[] = ["pancake", "venus", "aster", "hyperliquid", "polymarket"];

type RowState = {
	enabled: boolean;
	perTxCapBnb: string;
	dailyCapBnb: string;
};

function Switch({
	checked,
	disabled,
	onChange,
	label,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
	label: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={(e) => {
				e.stopPropagation();
				if (!disabled) onChange(!checked);
			}}
			onKeyDown={(e) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					e.stopPropagation();
					if (!disabled) onChange(!checked);
				}
			}}
			className={cn(
				"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-black",
				disabled && "opacity-40 cursor-not-allowed",
				!disabled && "cursor-pointer",
				checked ? "bg-[#22c55e]/50 border border-[#22c55e]/60" : "bg-neutral-800 border border-neutral-700",
			)}
		>
			<span
				className={cn(
					"inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
					checked ? "translate-x-[18px]" : "translate-x-[2px]",
				)}
			/>
		</button>
	);
}

function formatDefaultsLine(template: AdapterTemplate): string {
	return `Default: ${template.defaultPerTxCapBnb} BNB/tx • ${template.defaultDailyCapBnb} BNB/day`;
}

function rowFromPolicy(policy: AdapterPolicy | undefined, template: AdapterTemplate): RowState {
	return {
		enabled: Boolean(policy?.enabled),
		perTxCapBnb: policy?.perTxCapBnb != null ? String(policy.perTxCapBnb) : String(template.defaultPerTxCapBnb),
		dailyCapBnb: policy?.dailyCapBnb != null ? String(policy.dailyCapBnb) : String(template.defaultDailyCapBnb),
	};
}

function parseCap(value: string): number | null {
	if (value.trim() === "") return null;
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

type PolicyRowProps = {
	slug: string;
	template: AdapterTemplate;
	policy: AdapterPolicy | undefined;
	expanded: boolean;
	onToggleExpand: () => void;
	onSave: (next: { enabled: boolean; perTxCapBnb: number | null; dailyCapBnb: number | null }) => Promise<void>;
};

function PolicyRow({ slug, template, policy, expanded, onToggleExpand, onSave }: PolicyRowProps) {
	const [state, setState] = useState<RowState>(() => rowFromPolicy(policy, template));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	// Sync local state when the server pushes new data (refetch, other tabs, etc).
	const serverSig = `${policy?.enabled ?? false}|${policy?.perTxCapBnb ?? ""}|${policy?.dailyCapBnb ?? ""}`;
	const [lastSig, setLastSig] = useState(serverSig);
	if (serverSig !== lastSig) {
		setLastSig(serverSig);
		setState(rowFromPolicy(policy, template));
	}

	const savedRecently = savedAt != null && Date.now() - savedAt < 2000;

	async function commit(next: RowState) {
		const perTx = parseCap(next.perTxCapBnb);
		const daily = parseCap(next.dailyCapBnb);
		const prev = state;
		setState(next);
		setSaving(true);
		setError(null);
		try {
			await onSave({ enabled: next.enabled, perTxCapBnb: perTx, dailyCapBnb: daily });
			setSavedAt(Date.now());
			// Flash the saved checkmark for ~2s
			window.setTimeout(() => setSavedAt((t) => (t && Date.now() - t >= 1900 ? null : t)), 2100);
		} catch (e) {
			setState(prev);
			setError((e as Error).message || "Failed to save");
		} finally {
			setSaving(false);
		}
	}

	async function handleToggleEnabled(nextEnabled: boolean) {
		await commit({ ...state, enabled: nextEnabled });
	}

	async function handleSaveCaps() {
		await commit(state);
	}

	const accent = template.color ?? "#22c55e";
	const grayedOut = !state.enabled && !expanded;

	return (
		<li
			className={cn(
				"rounded-md border transition-colors",
				state.enabled
					? "border-autofun-background-action-highlight/40 bg-[#0E0E0E]"
					: "border-autofun-background-action-highlight/20 bg-[#0A0A0A]",
				grayedOut && "opacity-80",
			)}
		>
			<button
				type="button"
				onClick={onToggleExpand}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						onToggleExpand();
					}
				}}
				aria-expanded={expanded}
				aria-controls={`policy-panel-${slug}`}
				className={cn(
					"w-full flex items-center gap-3 px-4 py-3 text-left",
					"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#22c55e]/40 rounded-md",
				)}
			>
				<span
					aria-hidden="true"
					className="h-2.5 w-2.5 rounded-full shrink-0"
					style={{ backgroundColor: state.enabled ? accent : "#3a3a3a" }}
				/>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className={cn("text-sm font-medium", state.enabled ? "text-white" : "text-neutral-400")}>
							{template.name}
						</span>
						{savedRecently ? (
							<span
								aria-live="polite"
								className="text-[10px] uppercase tracking-wide text-[#22c55e] flex items-center gap-1"
							>
								<CheckIcon className="h-3 w-3" /> saved
							</span>
						) : null}
					</div>
					{template.description ? (
						<p className="text-xs text-neutral-500 mt-0.5 truncate">{template.description}</p>
					) : null}
				</div>
				<Switch
					checked={state.enabled}
					disabled={saving}
					onChange={handleToggleEnabled}
					label={`${template.name} ${state.enabled ? "enabled" : "disabled"}`}
				/>
				<ChevronDownIcon
					className={cn("h-4 w-4 text-neutral-500 transition-transform shrink-0", expanded && "rotate-180")}
					aria-hidden="true"
				/>
			</button>

			{expanded ? (
				<div
					id={`policy-panel-${slug}`}
					className={cn(
						"px-4 pb-4 pt-1 border-t border-autofun-background-action-highlight/20",
						!state.enabled && "opacity-60",
					)}
				>
					<p className="text-xs text-neutral-500 mb-3">{formatDefaultsLine(template)}</p>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<CapField
							id={`per-tx-${slug}`}
							label="Per-tx cap"
							value={state.perTxCapBnb}
							onChange={(v) => setState({ ...state, perTxCapBnb: v })}
							disabled={!state.enabled || saving}
						/>
						<CapField
							id={`daily-${slug}`}
							label="Daily cap"
							value={state.dailyCapBnb}
							onChange={(v) => setState({ ...state, dailyCapBnb: v })}
							disabled={!state.enabled || saving}
						/>
					</div>
					{error ? (
						<p role="alert" className="mt-3 text-xs text-red-400">
							Failed to save — retry. <span className="text-red-500/70">{error}</span>
						</p>
					) : null}
					<div className="mt-3 flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={handleSaveCaps}
							disabled={saving || !state.enabled}
							className={cn(
								"inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40",
								saving || !state.enabled
									? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
									: "bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/40 hover:bg-[#22c55e]/30",
							)}
						>
							{saving ? "Saving…" : "Save"}
						</button>
					</div>
				</div>
			) : null}
		</li>
	);
}

function CapField({
	id,
	label,
	value,
	onChange,
	disabled,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	disabled?: boolean;
}) {
	return (
		<div>
			<label htmlFor={id} className="block text-xs text-neutral-400 mb-1">
				{label}
			</label>
			<div className="relative">
				<Input
					id={id}
					type="number"
					inputMode="decimal"
					min={0}
					step="0.001"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className="pr-12 w-full"
				/>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500"
				>
					BNB
				</span>
			</div>
		</div>
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={3}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="M5 13l4 4L19 7" />
		</svg>
	);
}

export default function PolicyEditor({ agentId }: Props) {
	const { policies, templates, isLoading, error, notFound } = useAdapterPolicies(agentId);
	const mutate = useUpdateAdapterPolicy(agentId);
	const [expanded, setExpanded] = useState<string | null>(null);

	const policyBySlug = useMemo(() => {
		const map: Record<string, AdapterPolicy> = {};
		for (const p of policies) map[p.adapter] = p;
		return map;
	}, [policies]);

	const rows = useMemo(() => {
		const templateMap = templates ?? FALLBACK_TEMPLATES;
		const slugs = new Set<string>([...ADAPTER_ORDER, ...Object.keys(templateMap)]);
		return [...slugs]
			.filter((slug) => templateMap[slug])
			.sort((a, b) => {
				const ai = ADAPTER_ORDER.indexOf(a);
				const bi = ADAPTER_ORDER.indexOf(b);
				if (ai === -1 && bi === -1) return a.localeCompare(b);
				if (ai === -1) return 1;
				if (bi === -1) return -1;
				return ai - bi;
			})
			.map((slug) => ({ slug, template: templateMap[slug] }));
	}, [templates]);

	return (
		<section
			aria-label="Adapter permissions"
			className="p-5 rounded-md border border-autofun-background-action-highlight/40 bg-[#0C0C0C]"
		>
			<header className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-medium text-white uppercase tracking-wide">Adapter Permissions</h2>
				<span className="text-xs text-neutral-500">Patron controls</span>
			</header>

			{notFound ? (
				<EmptyState />
			) : isLoading ? (
				<LoadingSkeleton />
			) : error ? (
				<p role="alert" className="text-sm text-red-400">
					Couldn't load adapter policies. {error.message}
				</p>
			) : (
				<ul className="space-y-2">
					{rows.map(({ slug, template }) => (
						<PolicyRow
							key={slug}
							slug={slug}
							template={template}
							policy={policyBySlug[slug]}
							expanded={expanded === slug}
							onToggleExpand={() => setExpanded((cur) => (cur === slug ? null : slug))}
							onSave={async (next) => {
								await mutate.mutateAsync({
									adapter: slug,
									enabled: next.enabled,
									perTxCapBnb: next.perTxCapBnb,
									dailyCapBnb: next.dailyCapBnb,
								});
							}}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

function EmptyState() {
	return (
		<div className="rounded-md border border-dashed border-autofun-background-action-highlight/40 bg-[#0A0A0A] px-4 py-8 text-center">
			<p className="text-sm text-neutral-300">Adapter controls coming soon</p>
			<p className="text-xs text-neutral-500 mt-1">
				Patron-side toggles and caps will ship once the policy API is live.
			</p>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<ul className="space-y-2" aria-hidden="true">
			{[0, 1, 2, 3, 4].map((i) => (
				<li
					key={i}
					className="rounded-md border border-autofun-background-action-highlight/20 bg-[#0A0A0A] px-4 py-3 flex items-center gap-3"
				>
					<div className="h-2.5 w-2.5 rounded-full bg-[#141414] animate-pulse" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-32 rounded bg-[#141414] animate-pulse" />
						<div className="h-3 w-48 rounded bg-[#141414] animate-pulse" />
					</div>
					<div className="h-5 w-9 rounded-full bg-[#141414] animate-pulse" />
				</li>
			))}
		</ul>
	);
}
