"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { type ChangeEvent, type DragEvent, useCallback, useId, useRef, useState } from "react";
import { type ElizaImportResult, parseElizaCharacter } from "./eliza-import";
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
	const { t } = useTranslation();
	const { state, patchPersona, patchInviteCode } = useWizard();
	const [dragOver, setDragOver] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const nameId = useId();
	const tickerId = useId();
	const bioId = useId();
	const promptId = useId();
	const inviteCodeId = useId();
	const importTextareaId = useId();
	const importFileId = useId();
	const [mode, setMode] = useState<"import" | "create">("import");
	const [importText, setImportText] = useState("");
	const [importError, setImportError] = useState<string | null>(null);
	const [importWarnings, setImportWarnings] = useState<string[]>([]);

	const handleFile = useCallback(
		async (file: File) => {
			setUploadError(null);
			if (!file.type.startsWith("image/")) {
				setUploadError(t("wizard.persona.errors.fileMustBeImage"));
				return;
			}
			if (file.size > MAX_FILE_BYTES) {
				setUploadError(t("wizard.persona.errors.imageTooLarge4mb"));
				return;
			}
			const dataUrl = await new Promise<string | null>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
				reader.onerror = () => resolve(null);
				reader.readAsDataURL(file);
			});
			if (!dataUrl) {
				setUploadError(t("wizard.persona.errors.couldNotReadImage"));
				return;
			}
			// Verify dimensions
			const img = new window.Image();
			img.onload = () => {
				if (img.naturalWidth < MIN_AVATAR_PX || img.naturalHeight < MIN_AVATAR_PX) {
					setUploadError(
						t("wizard.persona.errors.minDimensions", {
							min: String(MIN_AVATAR_PX),
							width: String(img.naturalWidth),
							height: String(img.naturalHeight),
						}),
					);
					return;
				}
				patchPersona({ avatarDataUrl: dataUrl, avatarTemplateId: null });
			};
			img.onerror = () => setUploadError(t("wizard.persona.errors.imageDecodeFailed"));
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

	const applyImportResult = useCallback(
		(result: ElizaImportResult) => {
			if (!result.ok) {
				setImportError(result.error);
				setImportWarnings([]);
				return;
			}
			setImportError(null);
			setImportWarnings(result.warnings);
			patchPersona({
				name: result.persona.name,
				ticker: result.persona.ticker,
				bio: result.persona.bio,
				personaPrompt: result.persona.personaPrompt,
			});
		},
		[patchPersona],
	);

	const handleImportPaste = useCallback(() => {
		applyImportResult(parseElizaCharacter(importText));
	}, [applyImportResult, importText]);

	const handleImportFile = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				const raw = typeof reader.result === "string" ? reader.result : "";
				setImportText(raw);
				applyImportResult(parseElizaCharacter(raw));
			};
			reader.onerror = () => {
				setImportError(t("wizard.persona.errors.couldNotReadFile"));
			};
			reader.readAsText(file);
		},
		[applyImportResult],
	);

	return (
		<div className="flex flex-col gap-10">
			{/* Invite code (curated launch) */}
			<section className="border border-white/8 bg-white/[0.012] p-5">
				<label htmlFor={inviteCodeId} className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
					{t("wizard.persona.inviteLabel")}
				</label>
				<input
					id={inviteCodeId}
					type="text"
					value={state.inviteCode}
					onChange={(e) => patchInviteCode(e.target.value)}
					placeholder={t("wizard.persona.invitePlaceholder")}
					autoComplete="off"
					spellCheck={false}
					className="mt-2 w-full bg-black/40 border border-white/10 px-3 h-11 font-mono text-sm text-white placeholder:text-white/20 focus:border-[#00ff87]/50 outline-none"
				/>
				<p className="mt-2 text-[11px] text-white/40 leading-relaxed">
					{t("wizard.persona.inviteHelpBefore")} {" "}
					<a
						href="https://x.com/waifudotfun"
						target="_blank"
						rel="noopener noreferrer"
						className="text-[#00ff87] hover:opacity-80"
					>
						{t("wizard.persona.inviteHelpLink")}
					</a>
					.
				</p>
			</section>

			{/* Mode switcher: import existing agent vs create from scratch */}
			<section>
				<div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em]">
					<button
						type="button"
						onClick={() => setMode("import")}
						className={cn(
							"px-3 h-8 border",
							mode === "import"
								? "border-[#00ff87]/50 text-[#00ff87] bg-[#00ff87]/[0.04]"
								: "border-white/10 text-white/40 hover:text-white/70",
						)}
					>
						{t("wizard.persona.importTab")}
					</button>
					<button
						type="button"
						onClick={() => setMode("create")}
						className={cn(
							"px-3 h-8 border",
							mode === "create"
								? "border-[#00ff87]/50 text-[#00ff87] bg-[#00ff87]/[0.04]"
								: "border-white/10 text-white/40 hover:text-white/70",
						)}
					>
						{t("wizard.persona.createTab")}
					</button>
					<span className="text-white/30 ml-2">
						{mode === "import" ? t("wizard.persona.importBlurb") : t("wizard.persona.createBlurb")}
					</span>
				</div>

				{mode === "import" ? (
					<div className="mt-4 border border-white/8 bg-white/[0.012] p-5 flex flex-col gap-4">
						<div className="flex items-center justify-between">
							<label
								htmlFor={importTextareaId}
								className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400"
							>
								{t("wizard.persona.characterJson")}
							</label>
							<label
								htmlFor={importFileId}
								className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-[#00ff87] cursor-pointer"
							>
								{t("wizard.persona.uploadJson")}
							</label>
							<input
								id={importFileId}
								type="file"
								accept="application/json,.json"
								onChange={handleImportFile}
								className="sr-only"
							/>
						</div>
						<textarea
							id={importTextareaId}
							value={importText}
							onChange={(e) => setImportText(e.target.value)}
							placeholder={t("wizard.persona.importPlaceholder")}
							rows={8}
							spellCheck={false}
							className="w-full bg-black/40 border border-white/10 p-3 font-mono text-xs text-white placeholder:text-white/20 focus:border-[#00ff87]/50 outline-none leading-relaxed"
						/>
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={handleImportPaste}
								className="px-4 h-9 bg-[#00ff87] text-black text-[11px] font-mono uppercase tracking-[0.18em] hover:bg-[#00ff87]/90"
							>
								{t("wizard.persona.importCta")}
							</button>
							{state.persona.name ? (
								<span className="text-[11px] font-mono text-[#00ff87]">
									{t("wizard.persona.imported", { name: state.persona.name, ticker: state.persona.ticker })}
								</span>
							) : null}
						</div>
						{importError ? <p className="text-[11px] font-mono text-red-400">{importError}</p> : null}
						{importWarnings.length > 0 ? (
							<ul className="text-[11px] font-mono text-yellow-400/80 list-disc pl-4 leading-relaxed">
								{importWarnings.map((w) => (
									<li key={w}>{w}</li>
								))}
							</ul>
						) : null}
						<p className="text-[11px] text-white/40 leading-relaxed">
							we extract name, ticker (derived), bio, and persona prompt from the file. you can fine-tune in {t("wizard.persona.createTab")}
							mode after.
						</p>
					</div>
				) : null}
			</section>
			{/* {t("wizard.persona.avatarLabel")} */}
			<section>
				<div className="flex items-baseline justify-between">
					<label htmlFor={`${nameId}-avatar`} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						{t("wizard.persona.avatarLabel")}
					</label>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						{t("wizard.persona.minPx", { px: String(MIN_AVATAR_PX) })}
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
							aria-label={t("wizard.persona.uploadAvatarAria")}
						/>
						{state.persona.avatarDataUrl ? (
							<Image
								src={state.persona.avatarDataUrl}
								alt={t("wizard.persona.avatarPreviewAlt")}
								fill
								sizes="160px"
								className="object-cover"
								unoptimized
							/>
						) : (
							<div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
								<UploadIcon className="h-5 w-5 text-neutral-500" />
								<span className="text-[11px] text-neutral-500 leading-tight">
									{t("wizard.persona.dropImage")}
									<br />
									{t("wizard.persona.orClick")}
								</span>
							</div>
						)}
					</label>

					<div>
						<p className="text-xs text-neutral-500 leading-relaxed">
							{t("wizard.persona.templateHelp")}
						</p>
						<div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
							{TEMPLATES.map((t) => {
								const selected = state.persona.avatarTemplateId === t.id && !state.persona.avatarDataUrl;
								return (
									<button
										key={t.id}
										type="button"
										aria-pressed={selected}
										aria-label={t("wizard.persona.templateAria", { label: t.label })}
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
					label={t("wizard.persona.nameLabel")}
					value={state.persona.name}
					placeholder={t("wizard.persona.namePlaceholder")}
					maxLength={48}
					onChange={(v) => patchPersona({ name: v })}
				/>
				<Field
					id={tickerId}
					label={t("wizard.persona.tickerLabel")}
					value={tickerVal}
					placeholder={t("wizard.persona.tickerPlaceholder")}
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
					hint={tickerInvalid ? t("wizard.persona.tickerHintInvalid") : t("wizard.persona.tickerHint")}
				/>
			</section>

			{/* Bio */}
			<section>
				<FieldLabel htmlFor={bioId} label={t("wizard.persona.bioLabel")} counter={`${state.persona.bio.length}/${MAX_BIO}`} />
				<textarea
					id={bioId}
					value={state.persona.bio}
					onChange={(e) => patchPersona({ bio: e.target.value.slice(0, MAX_BIO) })}
					placeholder={t("wizard.persona.bioPlaceholder")}
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
					label={t("wizard.persona.promptLabel")}
					optional
					counter={`${state.persona.personaPrompt.length}/${MAX_PROMPT}`}
				/>
				<p className="mt-1 text-xs text-neutral-500 leading-relaxed max-w-[58ch]">
					{t("wizard.persona.promptHelp")}
				</p>
				<textarea
					id={promptId}
					value={state.persona.personaPrompt}
					onChange={(e) => patchPersona({ personaPrompt: e.target.value.slice(0, MAX_PROMPT) })}
					placeholder={t("wizard.persona.promptPlaceholder")}
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
	const { t } = useTranslation();
	return (
		<div className="flex items-baseline justify-between">
			<label htmlFor={htmlFor} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
				{label}
				{optional ? <span className="ml-2 text-neutral-600 lowercase tracking-normal">{t("wizard.common.optional")}</span> : null}
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
