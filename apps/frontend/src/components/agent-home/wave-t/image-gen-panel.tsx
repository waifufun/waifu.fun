/**
 * ImageGenPanel: the invoke surface for an agent's image-gen mini-app.
 *
 * Gated on the app being present + live in the `/v2/agents/:addr/apps`
 * registry. When absent or paused/scheduled, the panel renders nothing
 * (presence-based, never identity-based, same grammar as the rest of the
 * agent page).
 *
 * Flow:
 *   prompt textarea + aspect selector + "generate" button
 *   price strip: configured creator markup pct + metered model + a
 *     settlement-mode "credits" pill (Eliza Cloud metered)
 *   on submit -> POST /v2/agents/:addr/apps/image-gen/invoke (via apiFetch,
 *     which attaches the Steward JWT bearer when signed in)
 *   on success -> render the returned image + the settled charge total
 *   on 401 -> "sign in to generate"; on 402 -> "not enough credits";
 *     on 404 -> panel hides itself (defensive, should not happen since we
 *     gate on the registry row)
 *
 * UI follows Wave T grammar: <Panel>, mono numbers, lowercase copy, single
 * accent, honest empty/error states, no em-dashes, no fake precision.
 */

"use client";

import { ImageIcon, Loader2, SparklesIcon } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { App } from "@/lib/wave-t/apps";
import {
	IMAGE_GEN_APP_ID,
	IMAGE_GEN_ASPECTS,
	IMAGE_GEN_PROMPT_MAX,
	IMAGE_GEN_PROMPT_MIN,
	type ImageGenAspect,
	type ImageGenError,
	type ImageGenResult,
	imageGenMarkupPct,
	imageGenModel,
	invokeImageGen,
	isImageGenError,
} from "@/lib/wave-t/image-gen";

import { Label, Panel, Pulse } from "./_primitives";

interface ImageGenPanelProps {
	agentTokenAddress: string;
	apps: App[];
}

/** Find the live image-gen app row for this agent, if any. */
export function selectImageGenApp(apps: App[]): App | null {
	const row = apps.find((a) => a.appId === IMAGE_GEN_APP_ID);
	if (!row) return null;
	if (row.status !== "live") return null;
	return row;
}

function SettlementPill() {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--accent)]">
			<Pulse tone="accent" />
			credits
		</span>
	);
}

function formatUsd6(value: number | undefined): string | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

export function ImageGenPanel({ agentTokenAddress, apps }: ImageGenPanelProps) {
	const app = useMemo(() => selectImageGenApp(apps), [apps]);
	const promptId = useId();

	const [prompt, setPrompt] = useState("");
	const [aspect, setAspect] = useState<ImageGenAspect>("1:1");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<ImageGenError | null>(null);
	const [result, setResult] = useState<ImageGenResult | null>(null);
	// Set when the backend reports the app is no longer available (404) after
	// the page's apps snapshot was taken. Hides the panel to match the rest of
	// the presence-based gating instead of leaving a broken generator visible.
	const [unavailable, setUnavailable] = useState(false);

	const markupPct = app ? imageGenMarkupPct(app.metadata) : null;
	const model = app ? imageGenModel(app.metadata) : null;

	const trimmed = prompt.trim();
	const promptValid = trimmed.length >= IMAGE_GEN_PROMPT_MIN && trimmed.length <= IMAGE_GEN_PROMPT_MAX;

	const onGenerate = useCallback(async () => {
		if (!app || busy || !promptValid) return;
		setBusy(true);
		setError(null);
		// Drop any prior image so a failed retry never leaves stale output
		// (and a stale settled-charge caption) rendered under a fresh error.
		setResult(null);
		try {
			const res = await invokeImageGen({
				tokenAddress: agentTokenAddress,
				prompt: trimmed,
				aspect,
				// Fresh key per attempt so retries after an error are not
				// rejected as duplicates by the backend idempotency guard.
				idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
			});
			setResult(res);
		} catch (err) {
			if (isImageGenError(err)) {
				// A 404 means the registry row went stale (app paused/unpublished
				// since the snapshot). Hide the panel defensively, matching the
				// presence-based gating used everywhere else on the page.
				if (err.kind === "not-available") setUnavailable(true);
				setError(err);
			} else {
				setError({ kind: "unknown", status: 500, message: "image generation failed" });
			}
		} finally {
			setBusy(false);
		}
	}, [app, busy, promptValid, agentTokenAddress, trimmed, aspect]);

	// Gate: nothing renders unless the agent has a live image-gen app, or if
	// the backend told us mid-session the app is no longer available.
	if (!app || unavailable) return null;

	const settledTotal = formatUsd6(result?.charge?.totalCost);

	return (
		// The panel owns its own row wrapper so the parent can render it
		// unconditionally; when the gate above returns null, no empty spacer
		// row is left behind in the page grid.
		<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="image-gen">
			<div className="hidden lg:block" aria-hidden />
			<Panel>
				<Label right={<SettlementPill />}>
					<ImageIcon className="h-3 w-3" strokeWidth={1.5} />
					image generator
				</Label>

				{/* price / model strip */}
				<div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					<span>
						markup{" "}
						<span className="text-[var(--text-secondary)] normal-case tracking-normal">
							{markupPct === null ? "n/a" : `+${markupPct}%`}
						</span>
					</span>
					{model ? (
						<span>
							model <span className="text-[var(--text-secondary)] normal-case tracking-normal">{model}</span>
						</span>
					) : null}
					<span>
						price{" "}
						<span className="text-[var(--text-secondary)] normal-case tracking-normal">
							base + markup, billed on generate
						</span>
					</span>
				</div>

				<label
					htmlFor={promptId}
					className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]"
				>
					prompt
				</label>
				<textarea
					id={promptId}
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					maxLength={IMAGE_GEN_PROMPT_MAX}
					rows={3}
					placeholder="describe the image you want"
					disabled={busy}
					className={cn(
						"w-full resize-none rounded-md border border-[var(--border-soft)] bg-white/[0.02] px-3 py-2",
						"text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
						"outline-none transition-colors focus:border-[var(--accent)]/50",
						busy && "opacity-60",
					)}
				/>
				<div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					<span>aspect</span>
					<span className={cn(trimmed.length > IMAGE_GEN_PROMPT_MAX && "text-[var(--negative)]")}>
						{trimmed.length}/{IMAGE_GEN_PROMPT_MAX}
					</span>
				</div>

				<div className="mt-1.5 flex flex-wrap gap-1.5">
					{IMAGE_GEN_ASPECTS.map((a) => (
						<button
							key={a}
							type="button"
							disabled={busy}
							onClick={() => setAspect(a)}
							className={cn(
								"rounded-md border px-2 py-1 font-mono text-[10px] tabular-nums transition-colors",
								a === aspect
									? "border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)]"
									: "border-[var(--border-soft)] text-[var(--text-tertiary)] hover:border-[var(--border-mid)] hover:text-[var(--text-secondary)]",
								busy && "opacity-60",
							)}
						>
							{a}
						</button>
					))}
				</div>

				<button
					type="button"
					disabled={busy || !promptValid}
					onClick={onGenerate}
					className={cn(
						"mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2",
						"font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
						busy || !promptValid
							? "cursor-not-allowed border-[var(--border-soft)] text-[var(--text-tertiary)]"
							: "border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent-soft)]/80",
					)}
				>
					{busy ? (
						<>
							<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
							generating
						</>
					) : (
						<>
							<SparklesIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
							generate
						</>
					)}
				</button>

				{error ? (
					<div
						role="alert"
						className={cn(
							"mt-3 rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed",
							error.kind === "auth"
								? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
								: "border-[var(--negative)]/30 bg-[var(--negative)]/10 text-[var(--negative)]",
						)}
					>
						{error.message}
					</div>
				) : null}

				{result?.imageUrl ? (
					<figure className="mt-3">
						<img
							src={result.imageUrl}
							alt={result.prompt}
							className="w-full rounded-md border border-[var(--border-soft)] object-contain"
						/>
						<figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							<span>{result.aspect}</span>
							{settledTotal ? (
								<span>
									charged{" "}
									<span className="text-[var(--text-secondary)] normal-case tracking-normal">{settledTotal}</span>
								</span>
							) : null}
						</figcaption>
					</figure>
				) : null}
			</Panel>
		</div>
	);
}

export default ImageGenPanel;
