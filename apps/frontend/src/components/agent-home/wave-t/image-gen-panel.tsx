/**
 * Image-gen mini-app invoke surface.
 *
 * This file exports the image-gen INVOKE BODY (`ImageGenInvokeBody`): the
 * prompt + aspect + generate form, the price strip, and the settled result.
 * It does NOT own a Panel or a page row. The unified services catalog
 * (`services-section.tsx`) renders this body inline when a user opens the
 * image-gen service row, so browsing a service and invoking it now live in
 * one place instead of a detached panel bolted onto the page.
 *
 * Registry binding lives in `service-invoke.tsx`: image-gen is the first
 * concrete invoke surface, and future apps (twitter-replies, trading, ...)
 * register their own body the same way.
 *
 * Flow (unchanged, all real wiring preserved):
 *   prompt textarea + aspect selector + "generate" button
 *   price strip: configured creator markup pct + metered model + a
 *     settlement-mode "credits" pill (Eliza Cloud metered)
 *   on submit -> POST /v2/agents/:addr/apps/image-gen/invoke (via apiFetch,
 *     which attaches the Steward JWT bearer when signed in)
 *   on success -> render the returned image + the settled charge total
 *   on 401 -> "sign in to generate"; on 402 -> "not enough credits";
 *     on 404 -> the catalog row marks itself unavailable (defensive)
 *
 * Wave T grammar: mono numbers, lowercase copy, single accent, honest
 * empty/error states, no em-dashes, no fake precision.
 */

"use client";

import { Loader2, SparklesIcon } from "lucide-react";
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

import { Pulse } from "./_primitives";

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

export interface ImageGenInvokeBodyProps {
	agentTokenAddress: string;
	/** The live image-gen registry row. The catalog resolves and passes it. */
	app: App;
	/**
	 * Raised when the backend reports the app is no longer available (404)
	 * mid-session. The catalog uses this to flip the row to a disabled
	 * "not available" state instead of leaving a broken generator open.
	 */
	onUnavailable?: () => void;
}

/**
 * The image-gen invoke surface, sans Panel chrome. Designed to be dropped
 * inside the unified services catalog when its row is opened. All billing
 * wiring (markup, model, 401/402/404 handling, the idempotent POST) is
 * preserved exactly.
 */
export function ImageGenInvokeBody({ agentTokenAddress, app, onUnavailable }: ImageGenInvokeBodyProps) {
	const promptId = useId();

	const [prompt, setPrompt] = useState("");
	const [aspect, setAspect] = useState<ImageGenAspect>("1:1");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<ImageGenError | null>(null);
	const [result, setResult] = useState<ImageGenResult | null>(null);

	const markupPct = useMemo(() => imageGenMarkupPct(app.metadata), [app.metadata]);
	const model = useMemo(() => imageGenModel(app.metadata), [app.metadata]);

	const trimmed = prompt.trim();
	const promptValid = trimmed.length >= IMAGE_GEN_PROMPT_MIN && trimmed.length <= IMAGE_GEN_PROMPT_MAX;

	const onGenerate = useCallback(async () => {
		if (busy || !promptValid) return;
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
				// since the snapshot). Tell the catalog so it can flip the row to
				// a disabled state, matching presence-based gating elsewhere.
				if (err.kind === "not-available") onUnavailable?.();
				setError(err);
			} else {
				setError({ kind: "unknown", status: 500, message: "image generation failed" });
			}
		} finally {
			setBusy(false);
		}
	}, [busy, promptValid, agentTokenAddress, trimmed, aspect, onUnavailable]);

	const settledTotal = formatUsd6(result?.charge?.totalCost);

	return (
		<div>
			{/* price / model strip */}
			<div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span className="inline-flex items-center gap-1.5">
					settlement <SettlementPill />
				</span>
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
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={result.imageUrl}
						alt={result.prompt}
						className="w-full rounded-md border border-[var(--border-soft)] object-contain"
					/>
					<figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						<span>{result.aspect}</span>
						{settledTotal ? (
							<span>
								charged <span className="text-[var(--text-secondary)] normal-case tracking-normal">{settledTotal}</span>
							</span>
						) : null}
					</figcaption>
				</figure>
			) : null}
		</div>
	);
}
