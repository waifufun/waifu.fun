"use client";

import { FlapMetadataUploadError, shortenCid, uploadFlapMetadata } from "@/lib/flap/metadata";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckIcon, UploadIcon } from "./wizard-icons";
import { useWizard } from "./wizard-state";

const MAX_DESCRIPTION = 280;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MIN_IMAGE_PX = 256;

type UploadStatus =
	| { kind: "idle" }
	| { kind: "uploading" }
	| { kind: "ok"; cid: string; uri: string }
	| { kind: "error"; message: string };

/**
 * Wave H metadata step.
 *
 * Captures token image + description + social links, uploads them to
 * Flap's IPFS endpoint (`funcs.flap.sh/api/upload`), and stores the CID
 * on wizard state. The CID is required: subsequent steps stay locked
 * until upload succeeds. Upload failures surface a friendly retry
 * affordance and never block the wizard from going back.
 *
 * The image defaults to the persona avatar so users who only want one
 * visual identity don't have to upload twice. They can override.
 */
export default function StepMetadata() {
	const { state, patchFlap } = useWizard();
	const [status, setStatus] = useState<UploadStatus>(() =>
		state.flap.metaCid && state.flap.metaUri
			? { kind: "ok", cid: state.flap.metaCid, uri: state.flap.metaUri }
			: { kind: "idle" },
	);
	const [dragOver, setDragOver] = useState(false);
	const [imageError, setImageError] = useState<string | null>(null);
	const descId = useId();
	const twitterId = useId();
	const telegramId = useId();
	const websiteId = useId();
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	// Default the token image to the persona avatar if available and none chosen.
	useEffect(() => {
		if (!state.flap.tokenImageDataUrl && state.persona.avatarDataUrl) {
			patchFlap({ tokenImageDataUrl: state.persona.avatarDataUrl });
		}
	}, [state.flap.tokenImageDataUrl, state.persona.avatarDataUrl, patchFlap]);

	// Whenever the description / image / socials change after a successful
	// upload, invalidate the CID so the user must re-upload. Otherwise the
	// on-chain `meta` param could drift from what the user sees in review.
	useEffect(() => {
		if (status.kind === "ok") {
			// no-op: status holds the previous cid; we only invalidate inside
			// the change handlers below to avoid clobbering on a fresh mount.
		}
	}, [status]);

	const handleFile = useCallback(
		async (file: File) => {
			setImageError(null);
			if (!file.type.startsWith("image/")) {
				setImageError("file must be an image");
				return;
			}
			if (file.size > MAX_IMAGE_BYTES) {
				setImageError("image must be under 4 mb");
				return;
			}
			const dataUrl = await new Promise<string | null>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
				reader.onerror = () => resolve(null);
				reader.readAsDataURL(file);
			});
			if (!dataUrl) {
				setImageError("could not read image");
				return;
			}
			const img = new window.Image();
			img.onload = () => {
				if (img.naturalWidth < MIN_IMAGE_PX || img.naturalHeight < MIN_IMAGE_PX) {
					setImageError(`min ${MIN_IMAGE_PX}x${MIN_IMAGE_PX}; got ${img.naturalWidth}x${img.naturalHeight}`);
					return;
				}
				// New image invalidates any prior CID.
				patchFlap({ tokenImageDataUrl: dataUrl, metaCid: null, metaUri: null });
				setStatus({ kind: "idle" });
			};
			img.onerror = () => setImageError("image failed to decode");
			img.src = dataUrl;
		},
		[patchFlap],
	);

	const onDrop = useCallback(
		(e: DragEvent<HTMLLabelElement>) => {
			e.preventDefault();
			setDragOver(false);
			const f = e.dataTransfer.files?.[0];
			if (f) void handleFile(f);
		},
		[handleFile],
	);

	const onChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const f = e.target.files?.[0];
			if (f) void handleFile(f);
		},
		[handleFile],
	);

	const onChangeField = useCallback(
		(field: "description" | "twitter" | "telegram" | "website", value: string) => {
			// Any field change invalidates a prior CID.
			patchFlap({ [field]: value, metaCid: null, metaUri: null });
			if (status.kind === "ok") setStatus({ kind: "idle" });
		},
		[patchFlap, status.kind],
	);

	const handleUpload = useCallback(async () => {
		const image = state.flap.tokenImageDataUrl;
		if (!image) {
			setImageError("upload a token image first");
			return;
		}
		const desc = state.flap.description.trim();
		if (!desc) {
			setStatus({ kind: "error", message: "description required before upload" });
			return;
		}
		if (!state.persona.name.trim() || !state.persona.ticker.trim()) {
			setStatus({ kind: "error", message: "go back to persona; name + ticker are required" });
			return;
		}

		setStatus({ kind: "uploading" });
		try {
			const blob = await fetch(image).then((r) => r.blob());
			const result = await uploadFlapMetadata({
				name: state.persona.name.trim(),
				symbol: state.persona.ticker.trim(),
				description: desc,
				image: blob,
				twitter: state.flap.twitter || null,
				telegram: state.flap.telegram || null,
				website: state.flap.website || null,
			});
			patchFlap({ metaCid: result.cid, metaUri: result.uri });
			setStatus({ kind: "ok", cid: result.cid, uri: result.uri });
		} catch (err) {
			const message =
				err instanceof FlapMetadataUploadError
					? err.message
					: err instanceof Error
						? err.message
						: "flap upload failed";
			setStatus({ kind: "error", message });
		}
	}, [
		patchFlap,
		state.flap.description,
		state.flap.tokenImageDataUrl,
		state.flap.twitter,
		state.flap.telegram,
		state.flap.website,
		state.persona.name,
		state.persona.ticker,
	]);

	const uploading = status.kind === "uploading";
	const uploadedOk = status.kind === "ok";

	return (
		<div className="flex flex-col gap-10" data-testid="step-metadata">
			<section>
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">
					[wave h] · flap-native token metadata
				</p>
				<p className="mt-2 text-sm text-neutral-400 leading-relaxed max-w-[58ch]">
					flap mints your token via portal.newTokenV6 inside our atomic bundle. portal needs an ipfs cid for the token's
					image + description. upload here; the rest of the wizard stays locked until it lands.
				</p>
			</section>

			{/* Token image */}
			<section>
				<div className="flex items-baseline justify-between">
					<label htmlFor="flap-token-image" className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						token image
					</label>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						min {MIN_IMAGE_PX}px
					</span>
				</div>

				<div className="mt-3 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
					<label
						htmlFor="flap-token-image"
						onDragOver={(e) => {
							e.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={onDrop}
						className={cn(
							"relative aspect-square w-full sm:w-[160px] cursor-pointer",
							"border border-dashed flex items-center justify-center overflow-hidden",
							"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
							dragOver
								? "border-accent bg-accent/[0.04]"
								: state.flap.tokenImageDataUrl
									? "border-white/15 bg-black"
									: "border-white/10 bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.025]",
						)}
					>
						<input
							ref={fileInputRef}
							id="flap-token-image"
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="sr-only"
							onChange={onChange}
							aria-label="upload token image"
						/>
						{state.flap.tokenImageDataUrl ? (
							<Image
								src={state.flap.tokenImageDataUrl}
								alt="token image preview"
								fill
								sizes="160px"
								className="object-cover"
								unoptimized
							/>
						) : (
							<div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
								<UploadIcon className="h-5 w-5 text-neutral-500" />
								<span className="text-[11px] text-neutral-500 leading-tight">
									drop image
									<br />
									or click
								</span>
							</div>
						)}
					</label>

					<div className="text-xs text-neutral-500 leading-relaxed max-w-[44ch]">
						<p>png, jpeg, webp. defaults to your persona avatar. override here if your token has its own look.</p>
						<p className="mt-2 text-[11px] text-neutral-600">
							gets hashed onto ipfs via funcs.flap.sh/api/upload. nothing leaves your browser until you press upload.
						</p>
						{imageError ? (
							<p className="mt-3 text-xs text-red-400 font-mono" role="alert">
								{imageError}
							</p>
						) : null}
					</div>
				</div>
			</section>

			{/* Description */}
			<section>
				<div className="flex items-baseline justify-between">
					<label htmlFor={descId} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						description
					</label>
					<span className="text-[10px] font-mono tabular-nums tracking-[0.12em] text-neutral-600">
						{state.flap.description.length}/{MAX_DESCRIPTION}
					</span>
				</div>
				<textarea
					id={descId}
					value={state.flap.description}
					onChange={(e) => onChangeField("description", e.target.value.slice(0, MAX_DESCRIPTION))}
					placeholder="one or two lines about the agent. shows up on flap, dex screeners, and waifu.fun."
					rows={3}
					className={cn(
						"mt-2 w-full bg-white/[0.015] border border-white/10 px-4 py-3 text-sm text-white",
						"placeholder:text-neutral-600 outline-none resize-none leading-relaxed",
						"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
						"focus:border-white/30",
					)}
				/>
			</section>

			{/* Socials (optional) */}
			<section>
				<p className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
					socials <span className="ml-2 text-neutral-600 lowercase tracking-normal">optional</span>
				</p>
				<div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
					<SocialField
						id={twitterId}
						label="twitter"
						placeholder="@waifudotfun"
						value={state.flap.twitter}
						onChange={(v) => onChangeField("twitter", v)}
					/>
					<SocialField
						id={telegramId}
						label="telegram"
						placeholder="t.me/yourchannel"
						value={state.flap.telegram}
						onChange={(v) => onChangeField("telegram", v)}
					/>
					<SocialField
						id={websiteId}
						label="website"
						placeholder="https://your.site"
						value={state.flap.website}
						onChange={(v) => onChangeField("website", v)}
					/>
				</div>
			</section>

			{/* Upload action + status */}
			<section className="border border-white/8 bg-white/[0.012] p-5">
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={handleUpload}
							disabled={uploading || !state.flap.tokenImageDataUrl || !state.flap.description.trim()}
							className={cn(
								"inline-flex items-center gap-2 px-4 h-9 text-[11px] font-mono uppercase tracking-[0.18em]",
								"bg-accent text-black hover:bg-accent-dim",
								"disabled:bg-neutral-800 disabled:text-neutral-600 disabled:pointer-events-none",
							)}
							data-testid="flap-upload-button"
						>
							{uploading ? "uploading…" : uploadedOk ? "re-upload" : "upload to flap"}
						</button>
						{uploadedOk ? (
							<span
								className="inline-flex items-center gap-1.5 text-[11px] font-mono text-accent"
								data-testid="flap-cid-display"
							>
								<CheckIcon className="h-3 w-3" />
								cid: {shortenCid(status.cid)}
							</span>
						) : null}
					</div>

					{status.kind === "error" ? (
						<div
							className="border border-red-500/30 bg-red-500/[0.04] p-3 text-[11px] font-mono text-red-400"
							role="alert"
							data-testid="flap-upload-error"
						>
							<p>upload failed: {status.message}</p>
							<button
								type="button"
								onClick={handleUpload}
								className="mt-2 inline-flex items-center gap-1.5 underline underline-offset-2 hover:opacity-80"
							>
								retry →
							</button>
						</div>
					) : null}

					{uploadedOk ? (
						<p className="text-[11px] text-neutral-500 leading-relaxed">
							stored. you can edit fields and re-upload as long as you do it before submission.
						</p>
					) : (
						<p className="text-[11px] text-neutral-500 leading-relaxed">
							upload before you advance. if flap is having a moment, retry. we don't fall back to our own infra, flap is
							the source of truth.
						</p>
					)}
				</div>
			</section>
		</div>
	);
}

function SocialField({
	id,
	label,
	placeholder,
	value,
	onChange,
}: {
	id: string;
	label: string;
	placeholder: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div>
			<label htmlFor={id} className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
				{label}
			</label>
			<input
				id={id}
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				autoComplete="off"
				spellCheck={false}
				className={cn(
					"mt-1.5 w-full bg-white/[0.015] border border-white/10 px-3 h-10 text-sm text-white font-mono",
					"placeholder:text-neutral-600 outline-none",
					"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
					"focus:border-white/30",
				)}
			/>
		</div>
	);
}
