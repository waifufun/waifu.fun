"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
import { type ChangeEvent, type DragEvent, useCallback, useId, useRef, useState } from "react";
import { CheckIcon, UploadIcon } from "./wizard-icons";
import { useWizard } from "./wizard-state";

const TEMPLATES: { id: string; label: string; tone: string; gradient: string }[] = [
	{ id: "tessera", label: "tessera", tone: "geometric", gradient: "linear-gradient(135deg,#1f3a2b 0%,#0a0a0a 60%)" },
	{ id: "halia", label: "halia", tone: "warm static", gradient: "linear-gradient(135deg,#3a2f1f 0%,#0a0a0a 60%)" },
	{ id: "vesper", label: "vesper", tone: "twilight", gradient: "linear-gradient(135deg,#1f2a3a 0%,#0a0a0a 60%)" },
	{ id: "korin", label: "korin", tone: "circuit", gradient: "linear-gradient(135deg,#2a1f3a 0%,#0a0a0a 60%)" },
	{ id: "miren", label: "miren", tone: "obsidian", gradient: "linear-gradient(135deg,#1a1a1a 0%,#040404 60%)" },
	{ id: "ophir", label: "ophir", tone: "phosphor", gradient: "linear-gradient(135deg,#0e3320 0%,#0a0a0a 60%)" },
];

const MAX_BIO = 240;
const MAX_PROMPT = 2000;
const MIN_AVATAR_PX = 512;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export default function StepPersona() {
	const { state, patchPersona } = useWizard();
	const [dragOver, setDragOver] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const nameId = useId();
	const tickerId = useId();
	const bioId = useId();
	const promptId = useId();

	const handleFile = useCallback(
		async (file: File) => {
			setUploadError(null);
			if (!file.type.startsWith("image/")) {
				setUploadError("file must be an image");
				return;
			}
			if (file.size > MAX_FILE_BYTES) {
				setUploadError("image must be under 4 MB");
				return;
			}
			const dataUrl = await new Promise<string | null>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
				reader.onerror = () => resolve(null);
				reader.readAsDataURL(file);
			});
			if (!dataUrl) {
				setUploadError("could not read image");
				return;
			}
			// Verify dimensions
			const img = new window.Image();
			img.onload = () => {
				if (img.naturalWidth < MIN_AVATAR_PX || img.naturalHeight < MIN_AVATAR_PX) {
					setUploadError(`Min ${MIN_AVATAR_PX}x${MIN_AVATAR_PX}; got ${img.naturalWidth}x${img.naturalHeight}`);
					return;
				}
				patchPersona({ avatarDataUrl: dataUrl, avatarTemplateId: null });
			};
			img.onerror = () => setUploadError("image failed to decode");
			img.src = dataUrl;
		},
		[patchPersona],
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

	const tickerVal = state.persona.ticker;
	const tickerInvalid = tickerVal.length > 0 && !/^[A-Z0-9]{2,10}$/.test(tickerVal);

	return (
		<div className="flex flex-col gap-10">
			{/* Avatar */}
			<section>
				<div className="flex items-baseline justify-between">
					<label htmlFor={`${nameId}-avatar`} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						Avatar
					</label>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						min {MIN_AVATAR_PX}px
					</span>
				</div>

				<div className="mt-3 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
					<label
						id={`${nameId}-avatar`}
						htmlFor={`${nameId}-avatar-input`}
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
								: state.persona.avatarDataUrl
									? "border-white/15 bg-black"
									: "border-white/10 bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.025]",
						)}
					>
						<input
							ref={fileInputRef}
							id={`${nameId}-avatar-input`}
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="sr-only"
							onChange={onChange}
							aria-label="upload avatar image"
						/>
						{state.persona.avatarDataUrl ? (
							<Image
								src={state.persona.avatarDataUrl}
								alt="avatar preview"
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

					<div>
						<p className="text-xs text-neutral-500 leading-relaxed">
							or pick a template. placeholder until you upload your own.
						</p>
						<div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
							{TEMPLATES.map((t) => {
								const selected = state.persona.avatarTemplateId === t.id && !state.persona.avatarDataUrl;
								return (
									<button
										key={t.id}
										type="button"
										aria-pressed={selected}
										aria-label={`avatar template ${t.label}`}
										onClick={() => patchPersona({ avatarTemplateId: t.id, avatarDataUrl: null })}
										className={cn(
											"group relative aspect-square overflow-hidden border",
											"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
											selected ? "border-accent" : "border-white/10 hover:border-white/30",
										)}
										style={{ background: t.gradient }}
										title={`${t.label} (${t.tone})`}
									>
										<span className="sr-only">{t.label}</span>
										{selected ? (
											<span className="absolute inset-0 flex items-center justify-center bg-black/30">
												<CheckIcon className="h-4 w-4 text-accent" />
											</span>
										) : null}
									</button>
								);
							})}
						</div>
						{uploadError ? (
							<p className="mt-3 text-xs text-red-400 font-mono" role="alert">
								{uploadError}
							</p>
						) : null}
					</div>
				</div>
			</section>

			{/* Name + Ticker */}
			<section className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
				<Field
					id={nameId}
					label="name"
					value={state.persona.name}
					placeholder="Eliza"
					maxLength={48}
					onChange={(v) => patchPersona({ name: v })}
				/>
				<Field
					id={tickerId}
					label="ticker"
					value={tickerVal}
					placeholder="ELIZA"
					mono
					prefix="$"
					maxLength={10}
					invalid={tickerInvalid}
					onChange={(v) =>
						patchPersona({
							ticker: v
								.toUpperCase()
								.replace(/[^A-Z0-9]/g, "")
								.slice(0, 10),
						})
					}
					hint={tickerInvalid ? "two to ten uppercase letters or digits" : "two to ten chars, A-Z and 0-9"}
				/>
			</section>

			{/* Bio */}
			<section>
				<FieldLabel htmlFor={bioId} label="one-line bio" counter={`${state.persona.bio.length}/${MAX_BIO}`} />
				<textarea
					id={bioId}
					value={state.persona.bio}
					onChange={(e) => patchPersona({ bio: e.target.value.slice(0, MAX_BIO) })}
					placeholder="A reluctant treasury manager who reads charts at 4am and trusts almost nobody."
					rows={2}
					className={cn(
						"mt-2 w-full bg-white/[0.015] border border-white/10 px-4 py-3 text-sm text-white",
						"placeholder:text-neutral-600 outline-none resize-none leading-relaxed",
						"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
						"focus:border-white/30",
					)}
				/>
			</section>

			{/* Persona prompt */}
			<section>
				<FieldLabel
					htmlFor={promptId}
					label="persona prompt"
					optional
					counter={`${state.persona.personaPrompt.length}/${MAX_PROMPT}`}
				/>
				<p className="mt-1 text-xs text-neutral-500 leading-relaxed max-w-[58ch]">
					optional. steerable later. defines how the agent talks, reasons, and reacts to market moves. leave empty to
					use the default voice for the picked template.
				</p>
				<textarea
					id={promptId}
					value={state.persona.personaPrompt}
					onChange={(e) => patchPersona({ personaPrompt: e.target.value.slice(0, MAX_PROMPT) })}
					placeholder={
						"You are Eliza. You speak rarely, in lowercase. You distrust hype.\nYou size positions small until conviction earns more."
					}
					rows={6}
					className={cn(
						"mt-3 w-full bg-white/[0.015] border border-white/10 px-4 py-3 text-sm text-white font-mono",
						"placeholder:text-neutral-600 outline-none resize-none leading-relaxed",
						"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
						"focus:border-white/30",
					)}
				/>
			</section>
		</div>
	);
}

function FieldLabel({
	htmlFor,
	label,
	counter,
	optional,
}: {
	htmlFor: string;
	label: string;
	counter?: string;
	optional?: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between">
			<label htmlFor={htmlFor} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
				{label}
				{optional ? <span className="ml-2 text-neutral-600 lowercase tracking-normal">optional</span> : null}
			</label>
			{counter ? (
				<span className="text-[10px] font-mono tabular-nums tracking-[0.12em] text-neutral-600">{counter}</span>
			) : null}
		</div>
	);
}

function Field({
	id,
	label,
	value,
	placeholder,
	onChange,
	maxLength,
	mono,
	prefix,
	invalid,
	hint,
}: {
	id: string;
	label: string;
	value: string;
	placeholder: string;
	onChange: (v: string) => void;
	maxLength?: number;
	mono?: boolean;
	prefix?: string;
	invalid?: boolean;
	hint?: string;
}) {
	return (
		<div>
			<FieldLabel htmlFor={id} label={label} />
			<div
				className={cn(
					"mt-2 flex items-center bg-white/[0.015] border h-12 px-4",
					"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
					invalid ? "border-red-500/40 focus-within:border-red-500/70" : "border-white/10 focus-within:border-white/30",
				)}
			>
				{prefix ? <span className="text-neutral-500 font-mono mr-1">{prefix}</span> : null}
				<input
					id={id}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					maxLength={maxLength}
					aria-invalid={invalid || undefined}
					className={cn(
						"flex-1 bg-transparent outline-none text-white text-sm placeholder:text-neutral-600",
						mono && "font-mono tracking-tight",
					)}
				/>
			</div>
			{hint ? <p className="mt-1.5 text-[11px] text-neutral-500 font-mono">{hint}</p> : null}
		</div>
	);
}
