"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { DeployTerminalV2 } from "./deploy-terminal-v2";
import {
	ChevronLeft,
	ChevronRight,
	User,
	Wallet,
	Rocket,
	Check,
	Copy,
	ExternalLink,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Design tokens (matching existing waifufun palette)                 */
/* ------------------------------------------------------------------ */
const COLOR = {
	green: "#00ff87",
	greenDim: "#22c55e",
	bg: "#08080a",
	surface: "#111114",
	input: "#0e0e12",
	textPrimary: "#e4e4e7",
	textSecondary: "#a1a1aa",
	textTertiary: "#52525b",
	strokeLight: "rgba(255,255,255,0.06)",
	strokeHover: "rgba(255,255,255,0.12)",
	greenStroke: "rgba(0,255,135,0.25)",
	greenGhost: "rgba(0,255,135,0.06)",
} as const;

const labelClass =
	"text-[10px] font-mono uppercase tracking-[0.14em] text-[#71717a]";
const inputClass =
	"w-full bg-[#0e0e12] border border-[rgba(255,255,255,0.08)] text-sm text-[#e4e4e7] placeholder-[#3f3f46] font-mono px-3 py-2.5 rounded-sm outline-none transition-colors focus:border-[#00ff87] focus:ring-1 focus:ring-[#00ff87]/20";

/* ------------------------------------------------------------------ */
/*  Wizard steps config                                                */
/* ------------------------------------------------------------------ */
const STEPS = [
	{ id: 1, label: "Identity", icon: User },
	{ id: 2, label: "Economics", icon: Wallet },
	{ id: 3, label: "Deploy", icon: Rocket },
] as const;

/* ------------------------------------------------------------------ */
/*  Corner bracket decoration (reused pattern from existing wizard)    */
/* ------------------------------------------------------------------ */
function CornerBrackets() {
	return (
		<>
			<div className="absolute top-0 left-0 h-3 w-3 border-l border-t border-[#00ff87]/30 pointer-events-none" />
			<div className="absolute top-0 right-0 h-3 w-3 border-r border-t border-[#00ff87]/30 pointer-events-none" />
			<div className="absolute bottom-0 left-0 h-3 w-3 border-l border-b border-[#00ff87]/30 pointer-events-none" />
			<div className="absolute bottom-0 right-0 h-3 w-3 border-r border-b border-[#00ff87]/30 pointer-events-none" />
		</>
	);
}

/* ------------------------------------------------------------------ */
/*  Step indicator                                                     */
/* ------------------------------------------------------------------ */
function StepIndicator({
	currentStep,
	onStepClick,
}: {
	currentStep: number;
	onStepClick: (step: number) => void;
}) {
	const progressWidth = ((currentStep - 1) / (STEPS.length - 1)) * 100;

	return (
		<div className="w-full max-w-xl mx-auto mb-10">
			<div className="flex items-center justify-between relative">
				{/* track */}
				<div className="absolute top-5 left-[16%] right-[16%] h-px bg-[rgba(255,255,255,0.06)]" />
				<motion.div
					className="absolute top-5 left-[16%] h-px bg-[#00ff87]"
					initial={false}
					animate={{ width: `${progressWidth * 0.68}%` }}
					transition={{ type: "spring", stiffness: 300, damping: 30 }}
					style={{ boxShadow: "0 0 6px rgba(0,255,135,0.4)" }}
				/>

				{STEPS.map((step) => {
					const done = step.id < currentStep;
					const active = step.id === currentStep;
					const Icon = step.icon;

					return (
						<button
							key={step.id}
							type="button"
							onClick={() => step.id <= currentStep && onStepClick(step.id)}
							disabled={step.id > currentStep}
							className={cn(
								"relative z-10 flex flex-col items-center gap-2 transition-all",
								step.id <= currentStep
									? "cursor-pointer"
									: "cursor-not-allowed opacity-40",
							)}
						>
							<motion.div
								className={cn(
									"w-10 h-10 rounded-sm flex items-center justify-center font-mono text-xs transition-colors",
									done &&
										"bg-[#00ff87] text-[#08080a]",
									active &&
										"bg-[#00ff87] text-[#08080a] ring-2 ring-[#00ff87]/30 ring-offset-2 ring-offset-[#08080a]",
									!done &&
										!active &&
										"bg-[#111114] border border-[rgba(255,255,255,0.08)] text-[#52525b]",
								)}
								whileHover={{ scale: step.id <= currentStep ? 1.08 : 1 }}
								whileTap={{ scale: step.id <= currentStep ? 0.95 : 1 }}
								transition={{ type: "spring", stiffness: 400, damping: 20 }}
							>
								{done ? (
									<Check size={14} strokeWidth={3} />
								) : (
									<Icon size={14} />
								)}
							</motion.div>
							<span
								className={cn(
									"text-[10px] font-mono uppercase tracking-[0.12em]",
									done && "text-[#00ff87]",
									active && "text-[#e4e4e7] font-bold",
									!done && !active && "text-[#52525b]",
								)}
							>
								{step.label}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Supply split bar                                                   */
/* ------------------------------------------------------------------ */
function SupplySplitBar({ totalSupply }: { totalSupply: number }) {
	const segments = [
		{ label: "Bonding Curve", pct: 80, color: "#00ff87" },
		{ label: "Agent Treasury", pct: 10, color: "#22c55e" },
		{ label: "Creator", pct: 10, color: "#065f46" },
	];

	const formatted = new Intl.NumberFormat("en-US").format(totalSupply);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className={labelClass}>Supply allocation</span>
				<span className="text-[10px] font-mono text-[#52525b]">
					{formatted} tokens
				</span>
			</div>

			{/* bar */}
			<div className="flex h-3 rounded-sm overflow-hidden border border-[rgba(255,255,255,0.06)]">
				{segments.map((seg, i) => (
					<motion.div
						key={seg.label}
						className="h-full"
						style={{ backgroundColor: seg.color }}
						initial={{ width: 0 }}
						animate={{ width: `${seg.pct}%` }}
						transition={{
							delay: i * 0.12,
							duration: 0.6,
							ease: [0.25, 1, 0.5, 1],
						}}
					/>
				))}
			</div>

			{/* legend */}
			<div className="flex gap-4">
				{segments.map((seg) => (
					<div key={seg.label} className="flex items-center gap-1.5">
						<div
							className="w-2 h-2 rounded-sm"
							style={{ backgroundColor: seg.color }}
						/>
						<span className="text-[10px] font-mono text-[#a1a1aa]">
							{seg.pct}% {seg.label}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Step 1: Agent Identity                                             */
/* ------------------------------------------------------------------ */
function StepIdentity({
	config,
	onChange,
}: {
	config: AgentConfig;
	onChange: (patch: Partial<AgentConfig>) => void;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -12 }}
			transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
			className="space-y-6"
		>
			<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
				<CornerBrackets />

				<div className="space-y-5">
					{/* name + symbol row */}
					<div className="grid sm:grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<label htmlFor="v2-name" className={labelClass}>
								Name <span className="text-red-400">*</span>
							</label>
							<input
								id="v2-name"
								type="text"
								placeholder="agent name"
								value={config.name}
								onChange={(e) => onChange({ name: e.target.value })}
								className={inputClass}
								maxLength={64}
								autoComplete="off"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="v2-symbol" className={labelClass}>
								Symbol <span className="text-red-400">*</span>
							</label>
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff87] font-mono text-sm font-bold select-none">
									$
								</span>
								<input
									id="v2-symbol"
									type="text"
									placeholder="TICKER"
									value={config.symbol}
									onChange={(e) =>
										onChange({
											symbol: e.target.value
												.toUpperCase()
												.replace(/[^A-Z0-9]/g, "")
												.slice(0, 8),
										})
									}
									className={cn(inputClass, "pl-7")}
									maxLength={8}
									autoComplete="off"
								/>
							</div>
						</div>
					</div>

					{/* description */}
					<div className="space-y-1.5">
						<label htmlFor="v2-desc" className={labelClass}>
							Description
						</label>
						<textarea
							id="v2-desc"
							placeholder="what does this agent do?"
							value={config.description}
							onChange={(e) =>
								onChange({ description: e.target.value })
							}
							rows={3}
							className={cn(
								inputClass,
								"resize-none min-h-[80px]",
							)}
							maxLength={500}
						/>
						<div className="flex justify-end">
							<span className="text-[10px] font-mono text-[#3f3f46]">
								{config.description.length}/500
							</span>
						</div>
					</div>

					{/* avatar placeholder */}
					<div className="space-y-1.5">
						<span className={labelClass}>Avatar</span>
						<div className="w-20 h-20 rounded-sm border border-dashed border-[rgba(255,255,255,0.1)] bg-[#0e0e12] flex items-center justify-center">
							<User
								size={24}
								className="text-[#3f3f46]"
							/>
						</div>
						<p className="text-[10px] font-mono text-[#3f3f46]">
							image upload coming soon
						</p>
					</div>
				</div>
			</div>
		</motion.div>
	);
}

/* ------------------------------------------------------------------ */
/*  Step 2: Economics                                                  */
/* ------------------------------------------------------------------ */
function StepEconomics({
	config,
	onChange,
}: {
	config: AgentConfig;
	onChange: (patch: Partial<AgentConfig>) => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		if (!config.treasuryAddress) return;
		navigator.clipboard.writeText(config.treasuryAddress);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, [config.treasuryAddress]);

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -12 }}
			transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
			className="space-y-6"
		>
			<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
				<CornerBrackets />

				<div className="space-y-6">
					{/* total supply */}
					<div className="space-y-1.5">
						<label htmlFor="v2-supply" className={labelClass}>
							Total supply
						</label>
						<input
							id="v2-supply"
							type="text"
							inputMode="numeric"
							value={new Intl.NumberFormat("en-US").format(
								config.totalSupply,
							)}
							onChange={(e) => {
								const raw = e.target.value.replace(/[^0-9]/g, "");
								const num = Number.parseInt(raw, 10);
								if (!Number.isNaN(num) && num > 0) {
									onChange({ totalSupply: num });
								}
							}}
							className={cn(inputClass, "tabular-nums")}
							autoComplete="off"
						/>
						<p className="text-[10px] font-mono text-[#3f3f46]">
							default: 1,000,000,000
						</p>
					</div>

					{/* treasury address */}
					<div className="space-y-1.5">
						<label htmlFor="v2-treasury" className={labelClass}>
							Agent treasury address
						</label>
						<div className="flex gap-2">
							<input
								id="v2-treasury"
								type="text"
								placeholder="0x... (Gnosis Safe)"
								value={config.treasuryAddress}
								onChange={(e) =>
									onChange({
										treasuryAddress: e.target.value.trim(),
									})
								}
								className={cn(inputClass, "flex-1 tabular-nums")}
								spellCheck={false}
								autoComplete="off"
							/>
							{config.treasuryAddress && (
								<button
									type="button"
									onClick={handleCopy}
									className="px-3 border border-[rgba(255,255,255,0.08)] rounded-sm text-[#71717a] hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.15)] transition-colors"
									aria-label="Copy address"
								>
									{copied ? (
										<Check size={14} className="text-[#00ff87]" />
									) : (
										<Copy size={14} />
									)}
								</button>
							)}
						</div>
						<p className="text-[10px] font-mono text-[#3f3f46]">
							10% of supply goes here. use a Gnosis Safe for
							agent-controlled treasury.
						</p>
					</div>

					{/* supply split visualization */}
					<div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
						<SupplySplitBar totalSupply={config.totalSupply} />
					</div>
				</div>
			</div>
		</motion.div>
	);
}

/* ------------------------------------------------------------------ */
/*  Step 3: Review & Deploy                                            */
/* ------------------------------------------------------------------ */
function StepDeploy({
	config,
	isDeploying,
	isDeployed,
	deployedAddress,
	onDeploy,
}: {
	config: AgentConfig;
	isDeploying: boolean;
	isDeployed: boolean;
	deployedAddress: string | null;
	onDeploy: () => void;
}) {
	const formattedSupply = new Intl.NumberFormat("en-US").format(
		config.totalSupply,
	);
	const truncatedTreasury = config.treasuryAddress
		? `${config.treasuryAddress.slice(0, 6)}...${config.treasuryAddress.slice(-4)}`
		: "not set";

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -12 }}
			transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
			className="space-y-6"
		>
			{/* review summary */}
			{!isDeploying && !isDeployed && (
				<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
					<CornerBrackets />

					<div className="space-y-4">
						<span className={labelClass}>Review configuration</span>

						<div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-3">
							<ReviewRow label="Name" value={config.name || "---"} />
							<ReviewRow
								label="Symbol"
								value={
									config.symbol
										? `$${config.symbol}`
										: "---"
								}
								mono
							/>
							<ReviewRow
								label="Total supply"
								value={formattedSupply}
								mono
							/>
							<ReviewRow
								label="Treasury"
								value={truncatedTreasury}
								mono
							/>
						</div>

						{config.description && (
							<div className="pt-3 border-t border-[rgba(255,255,255,0.06)]">
								<p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#52525b] mb-1">
									Description
								</p>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									{config.description}
								</p>
							</div>
						)}

						<div className="pt-3 border-t border-[rgba(255,255,255,0.06)]">
							<SupplySplitBar totalSupply={config.totalSupply} />
						</div>
					</div>
				</div>
			)}

			{/* deploy button / terminal */}
			{!isDeploying && !isDeployed && (
				<motion.button
					type="button"
					onClick={onDeploy}
					disabled={!config.name || !config.symbol}
					className={cn(
						"w-full h-14 rounded-sm font-mono text-sm uppercase tracking-[0.14em] font-bold transition-colors",
						config.name && config.symbol
							? "bg-[#00ff87] text-[#08080a] hover:bg-[#22c55e] cursor-pointer"
							: "bg-[#1a1a1f] text-[#52525b] cursor-not-allowed",
					)}
					whileHover={
						config.name && config.symbol
							? { scale: 1.01 }
							: {}
					}
					whileTap={
						config.name && config.symbol
							? { scale: 0.98 }
							: {}
					}
					transition={{ type: "spring", stiffness: 400, damping: 20 }}
					style={
						config.name && config.symbol
							? {
									boxShadow:
										"0 0 24px rgba(0,255,135,0.25), 0 0 48px rgba(0,255,135,0.1)",
								}
							: {}
					}
				>
					<Rocket size={16} className="inline mr-2 -mt-0.5" />
					Deploy Agent
				</motion.button>
			)}

			{/* terminal output */}
			{(isDeploying || isDeployed) && (
				<DeployTerminalV2
					agentName={config.name}
					agentSymbol={config.symbol}
					treasuryAddress={config.treasuryAddress}
					deployedAddress={deployedAddress}
					isComplete={isDeployed}
				/>
			)}

			{/* post-deploy link */}
			{isDeployed && deployedAddress && (
				<motion.a
					href={`/token/${deployedAddress}`}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3, duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
					className="flex items-center justify-center gap-2 w-full h-12 rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/8 text-[#00ff87] font-mono text-sm uppercase tracking-[0.12em] hover:bg-[#00ff87]/15 transition-colors"
				>
					View agent
					<ExternalLink size={14} />
				</motion.a>
			)}
		</motion.div>
	);
}

function ReviewRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div>
			<p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#52525b]">
				{label}
			</p>
			<p
				className={cn(
					"text-sm text-[#e4e4e7] mt-0.5",
					mono && "font-mono tabular-nums",
				)}
			>
				{value}
			</p>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Agent config type                                                  */
/* ------------------------------------------------------------------ */
interface AgentConfig {
	name: string;
	symbol: string;
	description: string;
	totalSupply: number;
	treasuryAddress: string;
}

const DEFAULT_CONFIG: AgentConfig = {
	name: "",
	symbol: "",
	description: "",
	totalSupply: 1_000_000_000,
	treasuryAddress: "",
};

/* ------------------------------------------------------------------ */
/*  Simulated deploy (placeholder until real contracts)                */
/* ------------------------------------------------------------------ */
async function simulateDeploy(): Promise<string> {
	// Simulates contract deployment with a fake address
	await new Promise((r) => setTimeout(r, 6000));
	const hex = Array.from({ length: 40 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	return `0x${hex}`;
}

/* ------------------------------------------------------------------ */
/*  Main wizard                                                        */
/* ------------------------------------------------------------------ */
export function CreateWizardV2() {
	const [step, setStep] = useState(1);
	const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
	const [isDeploying, setIsDeploying] = useState(false);
	const [isDeployed, setIsDeployed] = useState(false);
	const [deployedAddress, setDeployedAddress] = useState<string | null>(null);

	const updateConfig = useCallback(
		(patch: Partial<AgentConfig>) =>
			setConfig((prev) => ({ ...prev, ...patch })),
		[],
	);

	const canProceed = useCallback(
		(s: number): boolean => {
			if (s === 1) return !!(config.name.trim() && config.symbol.trim());
			if (s === 2) return true; // economics has defaults
			return false;
		},
		[config.name, config.symbol],
	);

	const handleNext = useCallback(() => {
		if (step < 3 && canProceed(step)) {
			setStep((s) => s + 1);
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [step, canProceed]);

	const handleBack = useCallback(() => {
		if (step > 1) {
			setStep((s) => s - 1);
			window.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [step]);

	const handleDeploy = useCallback(async () => {
		setIsDeploying(true);
		try {
			const address = await simulateDeploy();
			setDeployedAddress(address);
			setIsDeployed(true);
		} catch {
			// error state would go here
		} finally {
			setIsDeploying(false);
		}
	}, []);

	return (
		<div className="w-full max-w-2xl mx-auto">
			<StepIndicator currentStep={step} onStepClick={setStep} />

			<AnimatePresence mode="wait">
				{step === 1 && (
					<StepIdentity
						key="identity"
						config={config}
						onChange={updateConfig}
					/>
				)}
				{step === 2 && (
					<StepEconomics
						key="economics"
						config={config}
						onChange={updateConfig}
					/>
				)}
				{step === 3 && (
					<StepDeploy
						key="deploy"
						config={config}
						isDeploying={isDeploying}
						isDeployed={isDeployed}
						deployedAddress={deployedAddress}
						onDeploy={handleDeploy}
					/>
				)}
			</AnimatePresence>

			{/* navigation */}
			{step < 3 && (
				<div className="flex gap-3 mt-8">
					<motion.button
						type="button"
						onClick={handleBack}
						disabled={step === 1}
						className={cn(
							"flex-1 h-12 rounded-sm font-mono text-xs uppercase tracking-[0.12em] border transition-colors",
							step === 1
								? "border-[rgba(255,255,255,0.04)] text-[#3f3f46] cursor-not-allowed"
								: "border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
						)}
						whileTap={{ scale: step > 1 ? 0.98 : 1 }}
						transition={{ type: "spring", stiffness: 400, damping: 20 }}
					>
						<ChevronLeft size={14} className="inline mr-1 -mt-px" />
						Back
					</motion.button>
					<motion.button
						type="button"
						onClick={handleNext}
						disabled={!canProceed(step)}
						className={cn(
							"flex-1 h-12 rounded-sm font-mono text-xs uppercase tracking-[0.12em] font-bold transition-colors",
							canProceed(step)
								? "bg-[#00ff87] text-[#08080a] hover:bg-[#22c55e] cursor-pointer"
								: "bg-[#1a1a1f] text-[#52525b] cursor-not-allowed",
						)}
						whileHover={{ scale: canProceed(step) ? 1.01 : 1 }}
						whileTap={{ scale: canProceed(step) ? 0.98 : 1 }}
						transition={{ type: "spring", stiffness: 400, damping: 20 }}
					>
						Next
						<ChevronRight
							size={14}
							className="inline ml-1 -mt-px"
						/>
					</motion.button>
				</div>
			)}
		</div>
	);
}
