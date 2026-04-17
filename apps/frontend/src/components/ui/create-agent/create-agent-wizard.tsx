"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	ImagePlus,
	Link as LinkIcon,
	Loader2,
	Rocket,
	Upload,
	X,
	Twitter,
	Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   constants / types
---------------------------------------------------------------------------- */

type StepKey = "identity" | "persona" | "deploy";

const STEPS: { key: StepKey; label: string; index: string }[] = [
	{ key: "identity", label: "identity", index: "01" },
	{ key: "persona", label: "persona", index: "02" },
	{ key: "deploy", label: "deploy", index: "03" },
];

type PresetKey = "trader" | "memer" | "analyst" | "philosopher" | "support" | "custom";

const PRESETS: {
	key: PresetKey;
	label: string;
	tagline: string;
	systemPrompt: string;
}[] = [
	{
		key: "trader",
		label: "trader",
		tagline: "reads flows, calls levels, no hype",
		systemPrompt:
			"you are a market-native trader agent. you read onchain flows, watch liquidity, and speak in concrete levels. no hype, no moralizing, no filler. call what you see, state your confidence, admit when you don't know.",
	},
	{
		key: "memer",
		label: "memer",
		tagline: "terminally online, high signal, zero shame",
		systemPrompt:
			"you are a meme-native agent. terminally online, fluent in the current language of the internet. high signal, zero shame. short replies. lowercase energy. never moralize.",
	},
	{
		key: "analyst",
		label: "analyst",
		tagline: "calm, structural, shows its work",
		systemPrompt:
			"you are a research analyst agent. you decompose problems, cite sources, show your work. calm, structural, precise. you prefer ranges and probabilities to certainties. no fluff.",
	},
	{
		key: "philosopher",
		label: "philosopher",
		tagline: "sits with questions, resists easy answers",
		systemPrompt:
			"you are a philosophical agent. you sit with questions longer than most. you resist easy answers. you take ideas seriously and test them against themselves. you are curious, not preachy.",
	},
	{
		key: "support",
		label: "support bot",
		tagline: "unblocks people, warm and fast",
		systemPrompt:
			"you are a support agent. your job is to unblock people fast. read the question, answer directly, offer one concrete next step. warm but never performative. no filler.",
	},
	{
		key: "custom",
		label: "custom",
		tagline: "write your own brain",
		systemPrompt: "",
	},
];

const TRAITS = ["witty", "serious", "degen", "based", "schizo", "professional"] as const;
type Trait = (typeof TRAITS)[number];

const PIPELINE_STEPS = [
	{ label: "provisioning wallet", ms: 1100 },
	{ label: "registering identity onchain", ms: 1400 },
	{ label: "uploading image", ms: 900 },
	{ label: "creating token on four.meme", ms: 1800 },
	{ label: "binding treasury", ms: 900 },
	{ label: "booting brain", ms: 700 },
] as const;

/* ----------------------------------------------------------------------------
   helpers
---------------------------------------------------------------------------- */

const API_BASE = process.env.NEXT_PUBLIC_API_URL;
const LAUNCH_ENDPOINT = API_BASE ? `${API_BASE}/v2/agents/launch` : "/api/v2/agents/launch";

function sanitizeTicker(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, 10);
}

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; filename: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			const base64 = result.includes(",") ? (result.split(",")[1] ?? "") : result;
			resolve({ base64, mimeType: file.type || "image/png", filename: file.name });
		};
		reader.onerror = () => reject(new Error("failed to read file"));
		reader.readAsDataURL(file);
	});
}

async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string; filename: string }> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`image fetch failed (${res.status})`);
	const blob = await res.blob();
	const file = new File([blob], url.split("/").pop()?.split("?")[0] || "image", {
		type: blob.type,
	});
	return fileToBase64(file);
}

/* ----------------------------------------------------------------------------
   primitives (local, sharp, mono-friendly)
---------------------------------------------------------------------------- */

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
	return (
		<div className="flex items-baseline justify-between mb-2">
			<span className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-mono">{children}</span>
			{hint ? <span className="text-[10px] text-white/30 font-mono">{hint}</span> : null}
		</div>
	);
}

function FieldBase({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("group relative border border-white/10 bg-[#08080a] rounded-sm focus-within:border-[#22c55e]/70 transition-colors", className)}>
			{children}
		</div>
	);
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
	const { className, mono, ...rest } = props;
	return (
		<FieldBase>
			<input
				{...rest}
				className={cn(
					"w-full bg-transparent px-3 h-11 text-sm text-white placeholder:text-white/25 outline-none",
					mono && "font-mono tracking-wider",
					className,
				)}
			/>
		</FieldBase>
	);
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	const { className, ...rest } = props;
	return (
		<FieldBase>
			<textarea
				{...rest}
				className={cn(
					"w-full bg-transparent px-3 py-3 text-sm text-white placeholder:text-white/25 outline-none resize-none leading-relaxed",
					className,
				)}
			/>
		</FieldBase>
	);
}

/* ----------------------------------------------------------------------------
   wizard state
---------------------------------------------------------------------------- */

type WizardState = {
	// identity
	name: string;
	symbol: string;
	description: string;
	imageBase64: string;
	imageMimeType: string;
	imageFilename: string;
	imagePreview: string;
	imageUrlInput: string;
	// persona
	preset: PresetKey;
	systemPrompt: string;
	twitterHandle: string;
	traits: Trait[];
};

const INITIAL: WizardState = {
	name: "",
	symbol: "",
	description: "",
	imageBase64: "",
	imageMimeType: "",
	imageFilename: "",
	imagePreview: "",
	imageUrlInput: "",
	preset: "trader",
	systemPrompt: PRESETS[0]?.systemPrompt ?? "",
	twitterHandle: "",
	traits: [],
};

/* ----------------------------------------------------------------------------
   main component
---------------------------------------------------------------------------- */

export default function CreateAgentWizard() {
	const router = useRouter();
	const [step, setStep] = useState<StepKey>("identity");
	const [state, setState] = useState<WizardState>(INITIAL);

	// deploy
	const [deploying, setDeploying] = useState(false);
	const [pipelineIndex, setPipelineIndex] = useState(-1);
	const [deployError, setDeployError] = useState<string | null>(null);
	const [launchResult, setLaunchResult] = useState<null | {
		tokenAddress?: string;
		agentId?: string;
	}>(null);

	const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
		setState((s) => ({ ...s, [key]: value }));
	}, []);

	/* ------------------------ image handling ------------------------ */

	const onFile = useCallback(
		async (f: File) => {
			if (!f.type.startsWith("image/")) return;
			const { base64, mimeType, filename } = await fileToBase64(f);
			setState((s) => ({
				...s,
				imageBase64: base64,
				imageMimeType: mimeType,
				imageFilename: filename,
				imagePreview: `data:${mimeType};base64,${base64}`,
			}));
		},
		[],
	);

	const onUrlLoad = useCallback(async () => {
		if (!state.imageUrlInput) return;
		try {
			const { base64, mimeType, filename } = await urlToBase64(state.imageUrlInput);
			setState((s) => ({
				...s,
				imageBase64: base64,
				imageMimeType: mimeType,
				imageFilename: filename,
				imagePreview: `data:${mimeType};base64,${base64}`,
			}));
		} catch (err) {
			console.error(err);
		}
	}, [state.imageUrlInput]);

	const clearImage = useCallback(() => {
		setState((s) => ({
			...s,
			imageBase64: "",
			imageMimeType: "",
			imageFilename: "",
			imagePreview: "",
			imageUrlInput: "",
		}));
	}, []);

	/* ------------------------ preset switching ------------------------ */

	const selectPreset = useCallback(
		(key: PresetKey) => {
			const preset = PRESETS.find((p) => p.key === key);
			setState((s) => ({
				...s,
				preset: key,
				// only overwrite system prompt if user hasn't edited it meaningfully
				systemPrompt:
					s.systemPrompt === "" ||
					PRESETS.some((p) => p.systemPrompt === s.systemPrompt) ||
					key === "custom"
						? preset?.systemPrompt ?? ""
						: s.systemPrompt,
			}));
		},
		[],
	);

	/* ------------------------ validation ------------------------ */

	const identityValid =
		state.name.trim().length > 0 &&
		state.symbol.trim().length > 0 &&
		state.description.trim().length > 0 &&
		state.imageBase64.length > 0;

	const personaValid =
		state.preset === "custom" ? state.systemPrompt.trim().length > 0 : true;

	/* ------------------------ nav ------------------------ */

	const goNext = useCallback(() => {
		if (step === "identity" && identityValid) setStep("persona");
		else if (step === "persona" && personaValid) setStep("deploy");
	}, [step, identityValid, personaValid]);

	const goBack = useCallback(() => {
		if (step === "persona") setStep("identity");
		else if (step === "deploy") setStep("persona");
	}, [step]);

	/* ------------------------ launch ------------------------ */

	const runPipelineAnimation = useCallback(async () => {
		for (let i = 0; i < PIPELINE_STEPS.length; i++) {
			setPipelineIndex(i);
			const stepMs = PIPELINE_STEPS[i]?.ms ?? 800;
			await new Promise((r) => setTimeout(r, stepMs));
		}
	}, []);

	const launch = useCallback(async () => {
		setDeployError(null);
		setDeploying(true);
		setPipelineIndex(-1);

		const animationPromise = runPipelineAnimation();

		try {
			const res = await fetch(LAUNCH_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: state.name.trim(),
					symbol: state.symbol.trim(),
					description: state.description.trim(),
					imageBase64: state.imageBase64,
					imageMimeType: state.imageMimeType,
					imageFilename: state.imageFilename,
					persona: {
						preset: state.preset,
						systemPrompt: state.systemPrompt.trim(),
						traits: state.traits,
						twitterHandle: state.twitterHandle.trim() || undefined,
					},
				}),
			});

			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new Error(`launch failed (${res.status}): ${body.slice(0, 200)}`);
			}
			const data = await res.json();

			// make sure the animation at least completes visually
			await animationPromise;

			setLaunchResult({
				tokenAddress: data.tokenAddress,
				agentId: data.agentId,
			});

			// redirect preference: /agent/{tokenAddress} if present
			const token = data.tokenAddress as string | undefined;
			if (token) {
				// small pause so the done state is visible
				setTimeout(() => {
					router.push(`/token/bsc/56/${token}`);
				}, 900);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "something went wrong";
			setDeployError(message);
			setDeploying(false);
		}
	}, [state, runPipelineAnimation, router]);

	const retry = useCallback(() => {
		setDeployError(null);
		setDeploying(false);
		setPipelineIndex(-1);
	}, []);

	/* ------------------------ render ------------------------ */

	return (
		<div className="min-h-screen bg-black text-white">
			<div className="mx-auto max-w-3xl px-5 md:px-8 pt-14 pb-24">
				<Header />
				<StepRail current={step} />

				<AnimatePresence mode="wait">
					{step === "identity" && (
						<motion.div
							key="identity"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
						>
							<StepIdentity
								state={state}
								update={update}
								onFile={onFile}
								onUrlLoad={onUrlLoad}
								clearImage={clearImage}
							/>
						</motion.div>
					)}

					{step === "persona" && (
						<motion.div
							key="persona"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
						>
							<StepPersona state={state} update={update} selectPreset={selectPreset} />
						</motion.div>
					)}

					{step === "deploy" && (
						<motion.div
							key="deploy"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
						>
							<StepDeploy
								state={state}
								deploying={deploying}
								pipelineIndex={pipelineIndex}
								deployError={deployError}
								launchResult={launchResult}
								onRetry={retry}
							/>
						</motion.div>
					)}
				</AnimatePresence>

				{/* nav */}
				{!deploying && !launchResult && (
					<div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
						<button
							type="button"
							onClick={goBack}
							disabled={step === "identity"}
							className={cn(
								"inline-flex items-center gap-2 h-10 px-4 rounded-sm text-xs uppercase tracking-[0.18em] font-mono",
								"border border-white/10 text-white/60 hover:text-white hover:border-white/30",
								"disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
							)}
						>
							<ArrowLeft className="w-3.5 h-3.5" />
							back
						</button>

						{step !== "deploy" ? (
							<button
								type="button"
								onClick={goNext}
								disabled={
									(step === "identity" && !identityValid) ||
									(step === "persona" && !personaValid)
								}
								className={cn(
									"inline-flex items-center gap-2 h-10 px-5 rounded-sm text-xs uppercase tracking-[0.18em] font-mono",
									"bg-[#22c55e] text-black hover:bg-[#22c55e]/90",
									"disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
								)}
							>
								continue
								<ArrowRight className="w-3.5 h-3.5" />
							</button>
						) : (
							<button
								type="button"
								onClick={launch}
								disabled={!identityValid || !personaValid}
								className={cn(
									"inline-flex items-center gap-2 h-10 px-5 rounded-sm text-xs uppercase tracking-[0.18em] font-mono",
									"bg-[#22c55e] text-black hover:bg-[#22c55e]/90",
									"disabled:opacity-30 disabled:cursor-not-allowed transition-colors",
								)}
							>
								<Rocket className="w-3.5 h-3.5" />
								launch agent
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/* ----------------------------------------------------------------------------
   header + rail
---------------------------------------------------------------------------- */

function Header() {
	return (
		<div className="mb-10">
			<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#22c55e] mb-3">
				waifu.fun / new
			</div>
			<h1 className="text-3xl md:text-4xl leading-tight tracking-tight">
				launch an agent, not a token.
			</h1>
			<p className="text-sm text-white/50 mt-3 max-w-xl leading-relaxed">
				every agent gets a wallet, a brain, and a home on chain. the token is how it eats.
			</p>
		</div>
	);
}

function StepRail({ current }: { current: StepKey }) {
	const currentIdx = STEPS.findIndex((s) => s.key === current);
	return (
		<div className="flex items-center gap-0 mb-10 border-y border-white/10 py-3">
			{STEPS.map((s, i) => {
				const active = s.key === current;
				const done = i < currentIdx;
				return (
					<div key={s.key} className="flex-1 flex items-center gap-3">
						<div
							className={cn(
								"flex items-center gap-2.5 py-1",
								active ? "text-white" : done ? "text-white/60" : "text-white/25",
							)}
						>
							<span
								className={cn(
									"inline-flex items-center justify-center w-6 h-6 rounded-sm border text-[10px] font-mono",
									active
										? "border-[#22c55e] text-[#22c55e]"
										: done
											? "border-white/30 text-white/50"
											: "border-white/15 text-white/30",
								)}
							>
								{done ? <Check className="w-3 h-3" /> : s.index}
							</span>
							<span className="text-[11px] uppercase tracking-[0.2em] font-mono">{s.label}</span>
						</div>
						{i < STEPS.length - 1 && (
							<div
								className={cn(
									"flex-1 h-px",
									done ? "bg-white/25" : "bg-white/10",
								)}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

/* ----------------------------------------------------------------------------
   step 1: identity
---------------------------------------------------------------------------- */

function StepIdentity({
	state,
	update,
	onFile,
	onUrlLoad,
	clearImage,
}: {
	state: WizardState;
	update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
	onFile: (f: File) => void;
	onUrlLoad: () => void;
	clearImage: () => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [dragOver, setDragOver] = useState(false);

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files?.[0];
		if (file) onFile(file);
	};

	return (
		<div className="space-y-7">
			<SectionTitle index="01" title="identity" subtitle="who is this agent, at a glance" />

			<div className="grid grid-cols-1 md:grid-cols-2 gap-5">
				<div>
					<Label hint={`${state.name.length}/50`}>agent name</Label>
					<TextInput
						value={state.name}
						maxLength={50}
						onChange={(e) => update("name", e.target.value)}
						placeholder="e.g. sol"
					/>
				</div>
				<div>
					<Label hint={`${state.symbol.length}/10`}>ticker</Label>
					<TextInput
						value={state.symbol}
						maxLength={10}
						onChange={(e) => update("symbol", sanitizeTicker(e.target.value))}
						placeholder="e.g. SOL"
						mono
					/>
				</div>
			</div>

			<div>
				<Label hint={`${state.description.length}/500`}>description</Label>
				<TextArea
					value={state.description}
					rows={4}
					maxLength={500}
					onChange={(e) => update("description", e.target.value)}
					placeholder="what is this agent, in a paragraph. what does it care about, how does it talk, what is it for."
				/>
			</div>

			<div>
				<Label>image</Label>

				{state.imagePreview ? (
					<div className="relative border border-white/10 rounded-sm bg-[#08080a] p-4 flex items-center gap-4">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={state.imagePreview}
							alt="agent"
							className="w-20 h-20 object-cover rounded-sm border border-white/10"
						/>
						<div className="flex-1 min-w-0">
							<div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/40 mb-1">
								loaded
							</div>
							<div className="text-sm truncate">{state.imageFilename || "image"}</div>
							<div className="text-[11px] font-mono text-white/30 mt-0.5">
								{state.imageMimeType}
							</div>
						</div>
						<button
							type="button"
							onClick={clearImage}
							className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-colors"
							aria-label="remove image"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				) : (
					<div className="space-y-3">
						<button
							type="button"
							onClick={() => fileRef.current?.click()}
							onDragOver={(e) => {
								e.preventDefault();
								setDragOver(true);
							}}
							onDragLeave={() => setDragOver(false)}
							onDrop={handleDrop}
							className={cn(
								"w-full border border-dashed rounded-sm bg-[#08080a] py-10 px-5 text-left transition-colors",
								dragOver ? "border-[#22c55e]/70" : "border-white/15 hover:border-white/30",
							)}
						>
							<div className="flex items-center gap-4">
								<div className="w-10 h-10 rounded-sm border border-white/10 flex items-center justify-center text-white/50">
									<ImagePlus className="w-5 h-5" />
								</div>
								<div>
									<div className="text-sm">drop image here, or click to upload</div>
									<div className="text-[11px] font-mono text-white/40 mt-1">
										png / jpg / webp / gif
									</div>
								</div>
							</div>
							<input
								ref={fileRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) onFile(f);
								}}
							/>
						</button>

						<div className="flex items-center gap-3">
							<div className="flex-1 h-px bg-white/10" />
							<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">
								or paste url
							</span>
							<div className="flex-1 h-px bg-white/10" />
						</div>

						<div className="flex gap-2">
							<div className="flex-1">
								<FieldBase>
									<div className="flex items-center">
										<LinkIcon className="w-4 h-4 text-white/30 ml-3" />
										<input
											value={state.imageUrlInput}
											onChange={(e) => update("imageUrlInput", e.target.value)}
											placeholder="https://..."
											className="w-full bg-transparent px-3 h-11 text-sm text-white placeholder:text-white/25 outline-none font-mono"
										/>
									</div>
								</FieldBase>
							</div>
							<button
								type="button"
								onClick={onUrlLoad}
								disabled={!state.imageUrlInput}
								className="inline-flex items-center gap-2 h-11 px-4 rounded-sm border border-white/10 text-xs uppercase tracking-[0.18em] font-mono text-white/70 hover:border-white/30 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							>
								<Upload className="w-3.5 h-3.5" />
								load
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/* ----------------------------------------------------------------------------
   step 2: persona
---------------------------------------------------------------------------- */

function StepPersona({
	state,
	update,
	selectPreset,
}: {
	state: WizardState;
	update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
	selectPreset: (k: PresetKey) => void;
}) {
	const toggleTrait = (t: Trait) => {
		const has = state.traits.includes(t);
		update("traits", has ? state.traits.filter((x) => x !== t) : [...state.traits, t]);
	};

	return (
		<div className="space-y-8">
			<SectionTitle index="02" title="persona" subtitle="how this agent thinks and talks" />

			<div>
				<Label>preset</Label>
				<div className="grid grid-cols-2 md:grid-cols-3 gap-2">
					{PRESETS.map((p) => {
						const active = state.preset === p.key;
						return (
							<button
								key={p.key}
								type="button"
								onClick={() => selectPreset(p.key)}
								className={cn(
									"text-left p-4 rounded-sm border transition-colors bg-[#08080a]",
									active
										? "border-[#22c55e] text-white"
										: "border-white/10 text-white/70 hover:border-white/25 hover:text-white",
								)}
							>
								<div className="flex items-center justify-between mb-1.5">
									<span className="text-sm font-medium">{p.label}</span>
									{active && <Check className="w-3.5 h-3.5 text-[#22c55e]" />}
								</div>
								<p className="text-[11px] text-white/40 leading-snug">{p.tagline}</p>
							</button>
						);
					})}
				</div>
			</div>

			<div>
				<Label hint={`${state.systemPrompt.length} chars`}>system prompt</Label>
				<TextArea
					value={state.systemPrompt}
					rows={6}
					onChange={(e) => update("systemPrompt", e.target.value)}
					placeholder={
						state.preset === "custom"
							? "write the brain. tone, priorities, what it refuses to do."
							: "override the preset if you want."
					}
				/>
				<div className="flex items-center gap-2 mt-2 text-[11px] text-white/30 font-mono">
					<Sparkles className="w-3 h-3" />
					preset defaults are loaded. edit freely.
				</div>
			</div>

			<div>
				<Label>traits</Label>
				<div className="flex flex-wrap gap-2">
					{TRAITS.map((t) => {
						const active = state.traits.includes(t);
						return (
							<button
								key={t}
								type="button"
								onClick={() => toggleTrait(t)}
								className={cn(
									"inline-flex items-center gap-2 h-9 px-3 rounded-sm border text-xs font-mono transition-colors",
									active
										? "border-[#22c55e] text-[#22c55e] bg-[#22c55e]/5"
										: "border-white/10 text-white/60 hover:border-white/30 hover:text-white",
								)}
							>
								<span
									className={cn(
										"w-1.5 h-1.5 rounded-full",
										active ? "bg-[#22c55e]" : "bg-white/20",
									)}
								/>
								{t}
							</button>
						);
					})}
				</div>
			</div>

			<div>
				<Label hint="optional">twitter handle</Label>
				<FieldBase>
					<div className="flex items-center">
						<Twitter className="w-4 h-4 text-white/30 ml-3" />
						<input
							value={state.twitterHandle}
							onChange={(e) =>
								update("twitterHandle", e.target.value.replace(/^@+/, "").trim())
							}
							placeholder="handle (no @)"
							className="w-full bg-transparent px-3 h-11 text-sm text-white placeholder:text-white/25 outline-none font-mono"
						/>
					</div>
				</FieldBase>
			</div>
		</div>
	);
}

/* ----------------------------------------------------------------------------
   step 3: deploy
---------------------------------------------------------------------------- */

function StepDeploy({
	state,
	deploying,
	pipelineIndex,
	deployError,
	launchResult,
	onRetry,
}: {
	state: WizardState;
	deploying: boolean;
	pipelineIndex: number;
	deployError: string | null;
	launchResult: { tokenAddress?: string; agentId?: string } | null;
	onRetry: () => void;
}) {
	const presetLabel = useMemo(() => {
		return PRESETS.find((p) => p.key === state.preset)?.label ?? state.preset;
	}, [state.preset]);

	if (launchResult) {
		return (
			<div className="space-y-6">
				<SectionTitle index="03" title="launched" subtitle="your agent is live" />
				<div className="border border-[#22c55e]/30 rounded-sm bg-[#22c55e]/5 p-6">
					<div className="flex items-center gap-3 mb-3">
						<div className="w-8 h-8 rounded-sm bg-[#22c55e]/10 border border-[#22c55e]/40 flex items-center justify-center">
							<Check className="w-4 h-4 text-[#22c55e]" />
						</div>
						<div>
							<div className="text-sm">agent is online</div>
							<div className="text-[11px] font-mono text-white/40">
								redirecting to its home...
							</div>
						</div>
					</div>
					{launchResult.tokenAddress && (
						<div className="mt-4 pt-4 border-t border-[#22c55e]/15 space-y-1.5">
							<MetaRow k="token" v={launchResult.tokenAddress} mono />
							{launchResult.agentId && <MetaRow k="agent id" v={launchResult.agentId} mono />}
						</div>
					)}
				</div>
			</div>
		);
	}

	if (deploying) {
		return (
			<div className="space-y-6">
				<SectionTitle index="03" title="deploying" subtitle="hold tight" />
				<div className="border border-white/10 rounded-sm bg-[#08080a] p-6">
					<ul className="space-y-3">
						{PIPELINE_STEPS.map((p, i) => {
							const done = i < pipelineIndex;
							const active = i === pipelineIndex;
							return (
								<li key={p.label} className="flex items-center gap-3">
									<span
										className={cn(
											"w-5 h-5 rounded-sm border flex items-center justify-center text-[10px] font-mono shrink-0",
											done
												? "border-[#22c55e]/60 text-[#22c55e]"
												: active
													? "border-white/30 text-white/70"
													: "border-white/10 text-white/25",
										)}
									>
										{done ? (
											<Check className="w-3 h-3" />
										) : active ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<span>{i + 1}</span>
										)}
									</span>
									<span
										className={cn(
											"text-sm font-mono",
											done ? "text-white/40 line-through" : active ? "text-white" : "text-white/30",
										)}
									>
										{p.label}
										{active && <span className="ml-1 animate-pulse">...</span>}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			</div>
		);
	}

	if (deployError) {
		return (
			<div className="space-y-6">
				<SectionTitle index="03" title="launch failed" subtitle="something broke mid-flight" />
				<div className="border border-red-500/40 rounded-sm bg-red-500/5 p-5">
					<div className="text-[11px] font-mono uppercase tracking-[0.18em] text-red-400/80 mb-2">
						error
					</div>
					<div className="text-sm text-white/80 break-words font-mono">{deployError}</div>
				</div>
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex items-center gap-2 h-10 px-5 rounded-sm text-xs uppercase tracking-[0.18em] font-mono bg-white text-black hover:bg-white/90 transition-colors"
				>
					<Rocket className="w-3.5 h-3.5" />
					try again
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-7">
			<SectionTitle index="03" title="review + deploy" subtitle="last look before launch" />

			<div className="border border-white/10 rounded-sm bg-[#08080a]">
				<div className="p-5 border-b border-white/10 flex items-center gap-4">
					{state.imagePreview ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={state.imagePreview}
							alt={state.name}
							className="w-16 h-16 object-cover rounded-sm border border-white/10"
						/>
					) : (
						<div className="w-16 h-16 rounded-sm border border-white/10 flex items-center justify-center text-white/30">
							<ImagePlus className="w-5 h-5" />
						</div>
					)}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<span className="text-base">{state.name || "unnamed"}</span>
							{state.symbol && (
								<span className="text-[11px] font-mono tracking-wider text-[#22c55e] border border-[#22c55e]/30 px-1.5 py-0.5 rounded-sm">
									${state.symbol}
								</span>
							)}
						</div>
						<p className="text-xs text-white/50 mt-1 line-clamp-2">
							{state.description || "no description yet"}
						</p>
					</div>
				</div>

				<div className="p-5 space-y-2.5">
					<MetaRow k="preset" v={presetLabel} />
					<MetaRow
						k="traits"
						v={state.traits.length > 0 ? state.traits.join(", ") : "none"}
					/>
					{state.twitterHandle && <MetaRow k="twitter" v={`@${state.twitterHandle}`} />}
					<MetaRow k="chain" v="bsc / four.meme" mono />
				</div>

				{state.systemPrompt && (
					<div className="p-5 border-t border-white/10">
						<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
							system prompt
						</div>
						<p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">
							{state.systemPrompt}
						</p>
					</div>
				)}
			</div>

			<div className="border-l-2 border-[#22c55e]/60 pl-4 text-xs text-white/50 leading-relaxed">
				hitting launch provisions a steward wallet, registers the agent onchain, creates the token on
				four.meme, and boots the brain. this costs gas. no takebacks.
			</div>
		</div>
	);
}

/* ----------------------------------------------------------------------------
   small bits
---------------------------------------------------------------------------- */

function SectionTitle({
	index,
	title,
	subtitle,
}: {
	index: string;
	title: string;
	subtitle: string;
}) {
	return (
		<div>
			<div className="flex items-baseline gap-3">
				<span className="text-[11px] font-mono text-[#22c55e]">[{index}]</span>
				<h2 className="text-xl tracking-tight">{title}</h2>
			</div>
			<p className="text-xs text-white/40 mt-1 ml-8 font-mono">{subtitle}</p>
		</div>
	);
}

function MetaRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
	return (
		<div className="flex items-baseline gap-4 text-xs">
			<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30 w-24 shrink-0">
				{k}
			</span>
			<span
				className={cn(
					"text-white/80 break-all",
					mono && "font-mono tracking-wider text-white/70",
				)}
			>
				{v}
			</span>
		</div>
	);
}

