"use client";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/create-token/textarea";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Slider } from "@/components/ui/create-token/slider";
import { FormSection } from "./form-section";
import { DeployButton } from "./deploy-button";
import { DeployTerminal, type DeployStage } from "./deploy-terminal";
import { DeploySuccess, type ProvisioningUiState } from "./deploy-success";
import { cn } from "@/lib/utils";
import {
	usePrompt,
	nameValidation,
	tickerValidation,
	descriptionValidation,
	tradeLimitValidation,
} from "@/components/hooks/providers/usePromptContext";
import { AlertTriangle, Info, Wallet } from "lucide-react";
import { toast } from "sonner";
import { createToken, provisionAgent, getProvisioningStatus, type AgentProvisionStatusResponse } from "@/lib/api";
import useBalance from "@/hooks/use-balance";
import useAddress from "@/hooks/use-address";
import { useAccount, useWriteContract, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { parseEther } from "viem";
import { Controller, type ControllerRenderProps } from "react-hook-form";
import { useRouter } from "next/navigation";
import type { AddressLike, TChain } from "@waifufun/types";
import { curveLimitConst } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";
import { PORTAL_ADDRESS, portalAbi, buildNewTokenV5Params, extractTokenAddressFromReceipt } from "@/lib/portal";
import { useTranslation } from "@/contexts/locale-context";

/** BNB has 18 decimals; 1 BNB = 1e18 wei */
const NATIVE_DECIMALS = 1e18;

const formElementBaseClass =
	"bg-[#0e0e12] border border-[rgba(255,255,255,0.08)] placeholder-[#52525b] text-sm focus:border-[#00ff87] focus:ring-1 focus:ring-[#00ff87]/30 text-[#e4e4e7] rounded-sm";
const formLabelBaseClass = "text-xs text-[#71717a] uppercase tracking-wider font-medium";
const sliderThumbClass =
	"block h-5 w-5 rounded-sm bg-[#00ff87] border-2 border-[#08080a] ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const sliderTrackClass =
	"relative h-2 w-full grow overflow-hidden rounded-sm bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.08)]";
const sliderRangeClass = "absolute h-full bg-[#00ff87]";

export const CoinInfoFields = ({
	idPrefix,
	collapsible = false,
	defaultOpen = true,
}: { idPrefix: string; collapsible?: boolean; defaultOpen?: boolean }) => {
	const {
		registerForm,
		formState: { errors },
	} = usePrompt();

	return (
		<FormSection title="Coin Info" collapsible={collapsible} defaultOpen={defaultOpen}>
			<div className="grid sm:grid-cols-2 gap-4">
				<div>
					<Label htmlFor={`${idPrefix}Name`} className={formLabelBaseClass}>
						Name <span className="text-red-500">*</span>
					</Label>
					<Input
						type="text"
						id={`${idPrefix}Name`}
						className={cn(formElementBaseClass, "mt-1 h-10", errors.name && "border-red-500 focus:border-red-500")}
						{...registerForm("name", nameValidation)}
					/>
					{errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
				</div>
				<div>
					<Label htmlFor={`${idPrefix}Ticker`} className={formLabelBaseClass}>
						Ticker <span className="text-red-500">*</span>
					</Label>
					<div className="relative">
						<Input
							type="text"
							id={`${idPrefix}Ticker`}
							className={cn(
								formElementBaseClass,
								"mt-1 h-10 pl-6",
								errors.symbol && "border-red-500 focus:border-red-500",
							)}
							{...registerForm("symbol", tickerValidation)}
						/>
						<span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#00ff87] font-bold text-sm">$</span>
					</div>
					{errors.symbol && <p className="text-red-500 text-xs mt-1">{errors.symbol.message}</p>}
				</div>
			</div>
			<div>
				<Label htmlFor={`${idPrefix}Description`} className={formLabelBaseClass}>
					Description <span className="text-red-500">*</span>
				</Label>
				<Textarea
					id={`${idPrefix}Description`}
					className={cn(
						formElementBaseClass,
						"mt-1 min-h-[80px]",
						errors.description && "border-red-500 focus:border-red-500",
					)}
					{...registerForm("description", descriptionValidation)}
				/>
				{errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
			</div>
		</FormSection>
	);
};

export const CustomAddressGenerator = ({
	idPrefix,
	collapsible = true,
	defaultOpen = false,
}: { idPrefix: string; collapsible?: boolean; defaultOpen?: boolean }) => {
	const [suffix, setSuffix] = useState("WAIFU");
	const { generateAddress, launchSalt, isGeneratingAddress, terminateWorkers, cancelVanityGeneration } = usePrompt();

	const handleGenerate = () => {
		generateAddress(suffix);
	};

	const handleCancel = () => {
		cancelVanityGeneration();
	};

	return (
		<FormSection title="Generate Custom Address" collapsible={collapsible} defaultOpen={defaultOpen}>
			<div className="flex items-end gap-2">
				<div className="flex-grow">
					<Label htmlFor={`${idPrefix}CustomAddress`} className={formLabelBaseClass}>
						Suffix
					</Label>
					<Input
						type="text"
						id={`${idPrefix}CustomAddress`}
						value={suffix}
						onChange={(e) => setSuffix(e.target.value.toUpperCase())}
						className={cn(formElementBaseClass, "mt-1 h-10 uppercase")}
						disabled={isGeneratingAddress}
					/>
				</div>
				{!isGeneratingAddress ? (
					<Button
						type="button"
						onClick={handleGenerate}
						variant="outline"
						className="h-10 border border-[rgba(255,255,255,0.1)] text-[#00ff87] hover:bg-[rgba(0,255,135,0.08)] hover:border-[#00ff87] rounded-sm font-bold uppercase text-xs px-3 transition-colors"
					>
						GENERATE
					</Button>
				) : (
					<Button
						type="button"
						onClick={handleCancel}
						variant="outline"
						className="h-10 border border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500 rounded-sm font-bold uppercase text-xs px-3 transition-colors"
					>
						CANCEL
					</Button>
				)}
			</div>
			<p className="text-xs text-[#00ff87] font-mono break-all bg-[rgba(17,17,20,0.7)] p-2 border border-[rgba(255,255,255,0.06)] rounded-sm min-h-[2rem] flex items-center">
				{launchSalt ? launchSalt : isGeneratingAddress ? "GENERATING..." : "Generate a salt to see it here"}
			</p>
			<div className="flex items-center gap-2">
				<Info size={12} className="text-gray-500" />
				<p className="text-[10px] text-gray-500">Longer suffixes are slower to generate.</p>
			</div>
		</FormSection>
	);
};

export const CustomCurveSection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const {
		control,
		formState: { errors },
	} = usePrompt();

	return (
		<Controller
			name="curveLimit"
			control={control}
			rules={{
				required: "Curve limit is required",
				min: { value: 0, message: "Must be ≥ 0" },
				max: { value: 1000, message: "Must be ≤ 1000" },
			}}
			render={({ field }) => (
				<FormSection title="curve-limit" collapsible={collapsible} defaultOpen={defaultOpen}>
					<div>
						<div className="flex justify-between items-center mb-1">
							<Label htmlFor="raiseAmount" className={formLabelBaseClass}>
								Raise Amount
							</Label>
							<span className="text-sm font-bold text-[#00ff87]">{field.value} BNB</span>
						</div>

						<Slider
							id="curveLimit"
							min={curveLimitConst / NATIVE_DECIMALS}
							max={678}
							step={1}
							value={[field.value]}
							onValueChange={(vals) => field.onChange(vals[0])}
							className="w-full"
							thumbClassName={sliderThumbClass}
							trackClassName={sliderTrackClass}
							rangeClassName={sliderRangeClass}
						/>
					</div>
					{errors.curveLimit && <p className="text-red-500 text-xs mt-1">{errors.curveLimit.message}</p>}
				</FormSection>
			)}
		/>
	);
};

export const DelayedStartSection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const {
		control,
		formState: { errors },
	} = usePrompt();
	const [mode, setMode] = useState<"preset" | "manual" | "instant">("instant");
	const presets = [
		{ label: "10 Min", value: 10 * 60 },
		{ label: "1 Hour", value: 60 * 60 },
		{ label: "4 Hours", value: 4 * 60 * 60 },
	];

	const handleModeChange = (
		newMode: "preset" | "manual" | "instant" | undefined,
		field: ControllerRenderProps<any, "delayForTrade">,
	) => {
		// Prevent unselecting
		if (!newMode) {
			return;
		}

		setMode(newMode);
		if (newMode === "instant") {
			field.onChange(0);
		} else if (newMode === "preset") {
			field.onChange(presets[0]?.value ?? 0);
		}
	};
	const handlePresetChange = (presetValue: string | undefined, field: ControllerRenderProps<any, "delayForTrade">) => {
		if (!presetValue) {
			return;
		}
		field.onChange(Number(presetValue));
	};

	return (
		<FormSection title="Delayed Start" collapsible={collapsible} defaultOpen={defaultOpen}>
			<div className="flex items-center gap-4 mb-3">
				<Controller
					name="delayForTrade"
					control={control}
					defaultValue={0}
					render={({ field }) => (
						<ToggleGroup
							type="single"
							value={mode}
							onValueChange={(v) => handleModeChange(v as "preset" | "manual" | "instant" | undefined, field)}
							className="grid grid-cols-3 gap-3"
						>
							<ToggleGroupItem
								value="instant"
								className="h-10 data-[state=on]:bg-[#00ff87] data-[state=on]:text-[#08080a] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[rgba(0,255,135,0.08)] rounded-sm font-semibold uppercase transition-colors"
							>
								Instant
							</ToggleGroupItem>
							<ToggleGroupItem
								value="preset"
								className="h-10 data-[state=on]:bg-[#00ff87] data-[state=on]:text-[#08080a] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[rgba(0,255,135,0.08)] rounded-sm font-semibold uppercase transition-colors"
							>
								Preset
							</ToggleGroupItem>
							<ToggleGroupItem
								value="manual"
								className="h-10 data-[state=on]:bg-[#00ff87] data-[state=on]:text-[#08080a] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[rgba(0,255,135,0.08)] rounded-sm font-semibold uppercase transition-colors"
							>
								Manual
							</ToggleGroupItem>
						</ToggleGroup>
					)}
				/>
			</div>
			<div className="flex items-center justify-between">
				<Controller
					name="delayForTrade"
					control={control}
					rules={{ required: "Please choose a delay", min: { value: 0, message: "Delay must be ≥ 0" } }}
					defaultValue={0}
					render={({ field }) =>
						mode === "preset" ? (
							<div className="w-full">
								<Label className={formLabelBaseClass}>Choose Delay</Label>
								<ToggleGroup
									type="single"
									value={String(field.value)}
									onValueChange={(v) => handlePresetChange(v, field)}
									className="grid grid-cols-3 gap-2 mt-1 mb-2"
								>
									{presets.map((p) => (
										<ToggleGroupItem
											key={p.value}
											value={String(p.value)}
											className="h-8 data-[state=on]:bg-[#00ff87] data-[state=on]:text-[#08080a] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[rgba(0,255,135,0.08)] rounded-sm font-semibold text-xs transition-colors"
										>
											{p.label}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</div>
						) : mode === "manual" ? (
							<div className="space-y-1 w-full">
								<Label htmlFor="manual-start" className={formLabelBaseClass}>
									Pick Start Date &amp; Time
								</Label>
								<Input
									id="manual-start"
									type="datetime-local"
									min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
									max={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
									onChange={(e) => {
										const inputValue = e.target.value;
										if (!inputValue) return;

										const then = new Date(inputValue).getTime();
										const now = Date.now();
										const secs = Math.floor((then - now) / 1000);

										const minSecs = 5 * 60;
										const maxSecs = 24 * 60 * 60;

										if (secs < minSecs) {
											toast.error("Minimum delay is 5 minutes");
											return;
										}

										if (secs > maxSecs) {
											toast.error("Maximum delay is 24 hours");
											return;
										}

										field.onChange(secs);
									}}
									className={cn(formElementBaseClass, "mt-1 h-10", errors.delayForTrade && "border-red-500")}
								/>
							</div>
						) : (
							<div className="space-y-1 w-full">
								<Label className={formLabelBaseClass}>Instant Start</Label>
								<p className="text-xs text-gray-400 mt-1">Trading will start immediately after token creation.</p>
							</div>
						)
					}
				/>
			</div>
			{errors.delayForTrade && <p className="text-red-500 text-xs mt-1">{errors.delayForTrade.message}</p>}
			<div className="flex items-center gap-2 mt-2">
				<Info size={12} className="text-gray-500" />
				<p className="text-[10px] text-gray-500">
					Delayed start is when trading begins - either after the preset time or at the selected date/time in your local
					timezone.
				</p>
			</div>
		</FormSection>
	);
};

export const TradeLimitSection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const {
		registerForm,
		watchValue,
		formState: { errors },
	} = usePrompt();

	return (
		<FormSection title="Trade Limit" collapsible={collapsible} defaultOpen={defaultOpen}>
			<div className="space-y-2">
				<div>
					<Label htmlFor="tradeLimitSol" className={formLabelBaseClass}>
						Max Buy/Sell (BNB) - First 8 Hours
					</Label>
					<div className="relative mt-1">
						<Input
							type="number"
							id="tradeLimitSol"
							{...registerForm("tradeLimitSol", tradeLimitValidation)}
							min="0"
							step="0.01"
							className={cn(formElementBaseClass, "h-10 pr-16")}
						/>
						<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00ff87] font-bold text-sm">BNB</span>
					</div>
					<p className="text-[10px] text-[#52525b] mt-1">
						Sets the maximum BNB amount per buy/sell transaction for the first 8 hours after launch.
					</p>
					{watchValue("tradeLimitSol") === 0 && (
						<div className="flex items-center mt-2 gap-2">
							<AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-400" />
							<p className="text-xs text-yellow-400">0 indicates no maximum token limit per trade</p>
						</div>
					)}

					{errors.tradeLimitSol && <p className="text-red-500 text-xs mt-1">{errors.tradeLimitSol.message}</p>}
				</div>
			</div>
		</FormSection>
	);
};

export const PreBuySection = ({
	idPrefix,
	collapsible = true,
	defaultOpen = false,
}: { idPrefix: string; collapsible?: boolean; defaultOpen?: boolean }) => {
	const {
		registerForm,
		formState: { errors },
		setValue,
	} = usePrompt();
	const address = useAddress();
	const balanceQuery = useBalance({
		chain: "evm",
		address,
	});
	const balance = balanceQuery?.data || 0;

	const setMaxAmount = () => {
		if (balance) {
			setValue("buyAmount", Math.min(balance * 0.97, 28), { shouldValidate: true, shouldDirty: true });
		}
	};

	return (
		<FormSection title="Pre-buy" collapsible={collapsible} defaultOpen={defaultOpen}>
			<div>
				<div className="flex items-center gap-2 mb-1">
					<Label htmlFor={`${idPrefix}BuyAmount`} className={formLabelBaseClass}>
						Buy Amount (BNB)
					</Label>
					<Info size={12} className="text-gray-500" />
				</div>
				<div className="relative mt-1">
					<Input
						type="number"
						id={`${idPrefix}BuyAmount`}
						step="any"
						className={cn(
							formElementBaseClass,
							"h-10 pr-16",
							errors.buyAmount && "border-red-500 focus:border-red-500",
						)}
						{...registerForm("buyAmount", {
							valueAsNumber: true,
							min: { value: 0, message: "Amount cannot be negative" },
							max: { value: Math.min(balance, 28), message: "Amount cannot be greater than your balance or 28" },
						})}
					/>
					<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00ff87] font-bold text-sm">BNB</span>
				</div>
				{errors.buyAmount && <p className="text-red-500 text-xs mt-1">{errors.buyAmount.message}</p>}
				<div className="flex justify-between items-center mt-1.5">
					<div className="flex items-center gap-2">
						<Wallet size={12} className="text-[#71717a]" />
						<p className="text-xs text-[#71717a]">Balance: {balance.toFixed(4)} BNB</p>
					</div>
					<Button
						type="button"
						variant="link"
						onClick={setMaxAmount}
						className="text-xs text-[#00ff87] hover:text-[#e4e4e7] p-0 h-auto transition-colors"
					>
						Max
					</Button>
				</div>
				<p className="text-[10px] text-yellow-400 mt-1">Maximum amount based on your balance (max 28 BNB).</p>
			</div>
		</FormSection>
	);
};

export const PoolSelection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const { pool, setPool } = usePrompt();

	const poolData = [{ name: "PancakeSwap", value: "pancakeswap", image: "/pools/pancakeswap.svg" }];

	return (
		<FormSection title="Choose Pool" collapsible={collapsible} defaultOpen={defaultOpen}>
			<ToggleGroup
				type="single"
				value={pool}
				onValueChange={(value) => {
					if (value) {
						setPool(value);
					}
				}}
				className="grid grid-cols-2 gap-3"
			>
				{poolData.map((poolItem) => (
					<ToggleGroupItem
						key={poolItem.value}
						value={poolItem.value}
						aria-label={poolItem.name}
						className="h-10 data-[state=on]:bg-[#00ff87] data-[state=on]:text-[#08080a] border border-[rgba(255,255,255,0.08)] text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[rgba(0,255,135,0.08)] rounded-sm font-semibold uppercase transition-colors"
					>
						<div className="flex items-center gap-2">
							<img src={poolItem.image} alt={poolItem.name} className="w-4 h-4" />
							{poolItem.name}
						</div>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</FormSection>
	);
};

export const LaunchButton = ({
	idPrefix,
	disabled = false,
}: {
	idPrefix?: string;
	disabled?: boolean;
}) => {
	const { t } = useTranslation();
	const { address: walletAddress, isConnected } = useAccount();
	const {
		handleSubmit,
		formState,
		uploadedImage,
		previousImages,
		isGeneratingAddress,
		isGeneratingMedia,
		watchValue,
		pool,
		launchSalt,
		setLaunching,
		setLaunchSalt,
		isLaunching,
		inviteCode,
	} = usePrompt();
	const router = useRouter();
	const wagmiConfig = useConfig();
	const { writeContractAsync } = useWriteContract();
	const [chain, chainId] = ["evm", 56];
	const [showSuccess, setShowSuccess] = useState(false);
	const [launchedTokenInfo, setLaunchedTokenInfo] = useState<{
		name: string;
		ticker: string;
		description: string;
		address: string;
		imageUrl?: string;
		launchId?: string;
	} | null>(null);
	const [provisioningState, setProvisioningState] = useState<ProvisioningUiState>({ status: "idle" });

	// Terminal state
	const [deployStages, setDeployStages] = useState<DeployStage[]>([]);
	const [showTerminal, setShowTerminal] = useState(false);
	const [deployProgress, setDeployProgress] = useState(0);

	const shouldDisable =
		!formState.isValid || isGeneratingAddress || isGeneratingMedia || isLaunching || !launchSalt || !isConnected;

	const balanceQuery = useBalance({
		chain: "evm",
		address: (walletAddress || "") as AddressLike,
	});

	const balance = balanceQuery?.data || 0;
	const buyAmount = Number(watchValue("buyAmount") || 0);
	const estimatedCost = 0.03; // Estimated gas cost in BNB

	// Helper to update stages
	const updateStage = (index: number, updates: Partial<DeployStage>) => {
		setDeployStages((prev) => {
			const newStages = [...prev];
			if (newStages[index]) {
				newStages[index] = { ...newStages[index], ...updates };
			}
			return newStages;
		});
	};

	// Reset provisioning state when success screen is dismissed
	useEffect(() => {
		if (!showSuccess) {
			setProvisioningState({ status: "idle" });
		}
	}, [showSuccess]);

	// Poll for provisioning status updates
	useEffect(() => {
		if (provisioningState.status !== "requested" && provisioningState.status !== "provisioning") {
			return;
		}

		let cancelled = false;
		let attempts = 0;
		let timeoutId: number | undefined;
		const maxAttempts = 60;
		const intervalMs = 3000;

		const applyStatus = (status: AgentProvisionStatusResponse) => {
			if (status.status === "failed") {
				setProvisioningState({
					status: "failed",
					jobId: status.jobId,
					message: status.message || "provisioning failed.",
				});
				return true;
			}

			if (status.status === "running" || status.status === "completed") {
				setProvisioningState({
					status: status.status,
					jobId: status.jobId,
					provisioningStatus: status.status,
					...(status.progress !== undefined ? { progress: status.progress } : {}),
					...(status.message ? { message: status.message } : {}),
					...(status.webUiUrl ? { webUiUrl: status.webUiUrl } : {}),
				});
				return true;
			}

			setProvisioningState({
				status: status.status === "provisioning" ? "provisioning" : "requested",
				jobId: status.jobId,
				provisioningStatus: status.status,
				...(status.progress !== undefined ? { progress: status.progress } : {}),
				...(status.message ? { message: status.message } : {}),
				...(status.webUiUrl ? { webUiUrl: status.webUiUrl } : {}),
			});
			return false;
		};

		const poll = async () => {
			try {
				const nextStatus = await getProvisioningStatus(provisioningState.jobId);
				if (cancelled) {
					return;
				}

				const finished = applyStatus(nextStatus);
				if (finished) {
					return;
				}
			} catch {
				if (cancelled) {
					return;
				}
			}

			if (!cancelled) {
				attempts += 1;
				if (attempts < maxAttempts) {
					timeoutId = window.setTimeout(poll, intervalMs);
					return;
				}
				setProvisioningState({
					status: "failed",
					jobId: provisioningState.jobId,
					message: "polling timed out. check the token page for status.",
				});
			}
		};

		timeoutId = window.setTimeout(poll, intervalMs);

		return () => {
			cancelled = true;
			if (timeoutId !== undefined) {
				window.clearTimeout(timeoutId);
			}
		};
	}, [provisioningState]);

	const onSubmit = async () => {
		if (!formState.isValid) {
			toast.error("fill in all required fields.");
			return;
		}

		if (!isConnected || !walletAddress) {
			toast.error("connect your wallet first.");
			return;
		}

		if (isGeneratingAddress) {
			toast.error("wait for address generation.");
			return;
		}

		if (!launchSalt) {
			toast.error("generate a launch salt first.");
			return;
		}

		if (balance < 0.01) {
			toast.error("insufficient balance. need at least 0.01 BNB.");
			return;
		}

		// Initialize terminal
		setShowTerminal(true);
		setShowSuccess(false);
		setDeployProgress(0);
		setDeployStages([
			{ label: "preparing parameters", status: "pending" },
			{ label: "awaiting signature", status: "pending" },
			{ label: "submitted", status: "pending" },
			{ label: "confirming", status: "pending" },
			{ label: "deployed", status: "pending" },
			{ label: "registering", status: "pending" },
			{ label: "done", status: "pending" },
		]);

		setLaunching(true);
		try {
			const name = String(watchValue("name") || "Untitled Token");
			const symbol = String(watchValue("symbol") || "TOKEN");
			const description = String(watchValue("description") || "");
			const buyAmount = Number(watchValue("buyAmount") || 0);
			const imageUrl = uploadedImage || previousImages?.[0] || "";

			// Stage 0: Preparing parameters
			updateStage(0, { status: "active" });
			setDeployProgress(10);

			// Build contract params
			const params = buildNewTokenV5Params({
				name,
				symbol,
				meta: imageUrl || description,
				salt: launchSalt as `0x${string}`,
				beneficiary: walletAddress as `0x${string}`,
				taxRate: 0,
				buyAmountBnb: String(buyAmount),
			});

			updateStage(0, { status: "success" });
			setDeployProgress(20);

			// Stage 1: Awaiting wallet signature
			updateStage(1, { status: "active" });
			toast.info("confirm in wallet");

			const txHash = await writeContractAsync({
				address: PORTAL_ADDRESS,
				abi: portalAbi,
				functionName: "newTokenV5",
				args: [params],
				value: buyAmount > 0 ? parseEther(String(buyAmount)) : 0n,
			});

			updateStage(1, { status: "success" });
			setDeployProgress(40);

			// Stage 2: Transaction submitted
			updateStage(2, { status: "success", detail: `${txHash.slice(0, 10)}...` });
			toast.success("submitted");
			setDeployProgress(50);

			// Stage 3: Confirming on-chain
			updateStage(3, { status: "active" });

			// Wait for receipt to get the token address
			const receipt = await waitForTransactionReceipt(wagmiConfig, {
				hash: txHash,
				confirmations: 2,
			});

			updateStage(3, { status: "success", detail: `block ${receipt.blockNumber}` });
			setDeployProgress(70);

			// Extract the created token address from receipt logs
			const tokenAddress = extractTokenAddressFromReceipt(receipt.logs);

			if (tokenAddress) {
				// Stage 4: Token deployed
				updateStage(4, { status: "success", detail: `${tokenAddress.slice(0, 10)}...` });
				toast.success("deployed");
				setDeployProgress(80);

				// Stage 5: Registering with platform
				updateStage(5, { status: "active" });

				const launchRecord = await createToken({
					contractAddress: tokenAddress,
					name,
					symbol,
					description,
					...(imageUrl ? { imageUrl } : {}),
					chain: chain as TChain,
					chainId,
					pool,
					signature: txHash,
					...(inviteCode ? { inviteCode } : {}),
				});

				if (!launchRecord?.launchId) {
					throw new Error("launch registration did not return a launch id");
				}

				updateStage(5, { status: "success", detail: launchRecord.launchId.slice(0, 10) });
				setDeployProgress(90);

				// Stage 6: Done
				updateStage(6, { status: "success" });
				setDeployProgress(100);

				setLaunchSalt(null);

				// Show success screen after a brief delay
				setTimeout(() => {
					setShowTerminal(false);
					setShowSuccess(true);
					setLaunchedTokenInfo({
						name,
						ticker: symbol,
						description,
						address: tokenAddress,
						imageUrl,
						launchId: launchRecord.launchId,
					});
				}, 1000);
			} else {
				toast.success("deployed");
				setLaunchSalt(null);
				router.push(`/token/${chain}/${chainId}/${txHash}`);
			}
		} catch (error: unknown) {
			console.error("Error launching token:", error);

			// Mark current active stage as error
			const activeIndex = deployStages.findIndex((s) => s.status === "active");
			if (activeIndex !== -1) {
				updateStage(activeIndex, {
					status: "error",
					detail: (error as Error)?.message?.slice(0, 50) || "failed",
				});
			}

			const errCode = (error as { code?: number })?.code;
			const errMessage = (error as Error)?.message;

			if (errCode === 4001 || errMessage?.includes("rejected")) {
				toast.error("rejected by user.");
			} else {
				const message = getErrorMessage(error);
				toast.error(`error: ${message}`);
			}
		} finally {
			setLaunching(false);
		}
	};

	const handleProvisionAgent = async () => {
		if (!launchedTokenInfo) {
			return;
		}

		setProvisioningState({ status: "requesting" });

		try {
			const result = await provisionAgent({
				tokenAddress: launchedTokenInfo.address,
				agentName: launchedTokenInfo.name,
				tokenName: launchedTokenInfo.name,
				tokenTicker: launchedTokenInfo.ticker,
				chain: chain as TChain,
				chainId,
				...(launchedTokenInfo.launchId ? { launchId: launchedTokenInfo.launchId } : {}),
				agentConfig: {
					...(launchedTokenInfo.description ? { bio: launchedTokenInfo.description } : {}),
					...(launchedTokenInfo.imageUrl ? { avatar: launchedTokenInfo.imageUrl } : {}),
				},
			});

			setProvisioningState({
				status:
					result.status === "provisioning"
						? "provisioning"
						: result.status === "running" || result.status === "completed"
							? result.status
							: "requested",
				jobId: result.jobId,
				provisioningStatus: result.status,
				...(result.message ? { message: result.message } : {}),
				...(result.webUiUrl ? { webUiUrl: result.webUiUrl } : {}),
			});
			toast.success("provisioning requested.");
		} catch (error) {
			const message = getErrorMessage(error);
			setProvisioningState({
				status: "failed",
				message,
			});
			toast.error(`provisioning failed: ${message}`);
		}
	};

	const handleViewToken = () => {
		if (launchedTokenInfo) {
			router.push(`/token/${chain}/${chainId}/${launchedTokenInfo.address}`);
		}
	};

	return (
		<div className="w-full">
			<DeployButton
				onClick={onSubmit}
				disabled={shouldDisable || disabled}
				isLoading={isLaunching}
				loadingText={t("create.launching")}
				balance={balance}
				estimatedCost={estimatedCost}
				prebuyAmount={buyAmount}
			>
				{!isConnected ? t("create.connectWalletButton") : t("create.deployAgentButton")}
			</DeployButton>

			{/* Terminal Display */}
			{showTerminal && (
				<div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
					<DeployTerminal stages={deployStages} progress={deployProgress} onDismiss={() => setShowTerminal(false)} />
				</div>
			)}

			{/* Success Screen */}
			{showSuccess && launchedTokenInfo && (
				<div className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
					<DeploySuccess
						agentName={launchedTokenInfo.name}
						ticker={launchedTokenInfo.ticker}
						tokenAddress={launchedTokenInfo.address}
						imageUrl={launchedTokenInfo.imageUrl}
						onProvisionAgent={handleProvisionAgent}
						onViewToken={handleViewToken}
						provisioningState={provisioningState}
					/>
				</div>
			)}
		</div>
	);
};
