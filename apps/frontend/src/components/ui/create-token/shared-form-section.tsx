"use client";

/**
 * Shared form field components for the create-token wizard.
 *
 * Each export is a self-contained field group that reads/writes form state
 * through the PromptProvider (usePrompt). The wizard step components import
 * these and compose them into step layouts.
 *
 * FormSection wrapping is intentionally kept on each component so they render
 * correctly both as standalone sections and inside wizard steps. Pass
 * collapsible={false} from wizard steps for flat layouts.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Slider } from "@/components/ui/create-token/slider";
import { FormSection } from "./form-section";
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
import useBalance from "@/hooks/use-balance";
import useAddress from "@/hooks/use-address";
import { Controller, type ControllerRenderProps } from "react-hook-form";
import { curveLimitConst } from "@/lib/utils";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Textarea } from "@/components/ui/create-token/textarea";

/* ------------------------------------------------------------------ */
/*  Shared style tokens                                                */
/* ------------------------------------------------------------------ */

const formElementBaseClass =
	"bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)]";
const formLabelBaseClass = "text-xs text-gray-400 uppercase tracking-wider font-semibold";
const sliderThumbClass =
	"block h-5 w-5 rounded-none bg-[#03FF24] border-2 border-black ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-[2px_2px_0px_black]";
const sliderTrackClass = "relative h-2 w-full grow overflow-hidden rounded-none bg-black/50 border border-[#03FF24]/50";
const sliderRangeClass = "absolute h-full bg-[#03FF24]";

/* ------------------------------------------------------------------ */
/*  CoinInfoFields                                                     */
/* ------------------------------------------------------------------ */

export const CoinInfoFields = ({
	idPrefix = "waifu",
	collapsible = false,
	defaultOpen = true,
}: { idPrefix?: string; collapsible?: boolean; defaultOpen?: boolean }) => {
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
						<span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#03FF24] font-bold text-sm">$</span>
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

/* ------------------------------------------------------------------ */
/*  CustomAddressGenerator                                             */
/* ------------------------------------------------------------------ */

export const CustomAddressGenerator = ({
	idPrefix = "waifu",
	collapsible = true,
	defaultOpen = false,
}: { idPrefix?: string; collapsible?: boolean; defaultOpen?: boolean }) => {
	const [suffix, setSuffix] = useState("FUN");
	const { generateAddress, mintKeyPair, isGeneratingAddress, cancelVanityGeneration } = usePrompt();

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
						onClick={() => generateAddress(suffix)}
						variant="outline"
						className="h-10 border-2 border-[#03FF24]/70 text-[#03FF24] hover:bg-[#03FF24]/20 hover:border-[#03FF24] rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] font-bold uppercase text-xs px-3"
					>
						GENERATE
					</Button>
				) : (
					<Button
						type="button"
						onClick={cancelVanityGeneration}
						variant="outline"
						className="h-10 border-2 border-red-500/70 text-red-400 hover:bg-red-500/20 hover:border-red-500 rounded-none shadow-[3px_3px_0px_rgba(239,68,68,0.3)] font-bold uppercase text-xs px-3"
					>
						CANCEL
					</Button>
				)}
			</div>
			<p className="text-xs text-[#03FF24] font-mono break-all bg-black/40 p-2 border border-[#03FF24]/30 rounded-none shadow-inner min-h-[2rem] flex items-center">
				{mintKeyPair
					? mintKeyPair.publicKey.toString()
					: isGeneratingAddress
						? "GENERATING..."
						: "Generate an address to see it here"}
			</p>
			<div className="flex items-center gap-2">
				<Info size={12} className="text-gray-500" />
				<p className="text-[10px] text-gray-500">Longer suffixes are slower to generate.</p>
			</div>
		</FormSection>
	);
};

/* ------------------------------------------------------------------ */
/*  CustomCurveSection                                                 */
/* ------------------------------------------------------------------ */

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
				min: { value: 0, message: "Must be >= 0" },
				max: { value: 1000, message: "Must be <= 1000" },
			}}
			render={({ field }) => (
				<FormSection title="Curve Limit" collapsible={collapsible} defaultOpen={defaultOpen}>
					<div>
						<div className="flex justify-between items-center mb-1">
							<Label htmlFor="raiseAmount" className={formLabelBaseClass}>
								Raise Amount
							</Label>
							<span className="text-sm font-bold text-[#03FF24]">{field.value} SOL</span>
						</div>
						<Slider
							id="curveLimit"
							min={curveLimitConst / LAMPORTS_PER_SOL}
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

/* ------------------------------------------------------------------ */
/*  DelayedStartSection                                                */
/* ------------------------------------------------------------------ */

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

	// biome-ignore lint/suspicious/noExplicitAny: field type
	const handleModeChange = (newMode: "preset" | "manual" | "instant" | undefined, field: ControllerRenderProps<any, "delayForTrade">) => {
		if (!newMode) return;
		setMode(newMode);
		if (newMode === "instant") field.onChange(0);
		else if (newMode === "preset") field.onChange(presets[0]?.value ?? 0);
	};

	// biome-ignore lint/suspicious/noExplicitAny: field type
	const handlePresetChange = (presetValue: string | undefined, field: ControllerRenderProps<any, "delayForTrade">) => {
		if (!presetValue) return;
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
								className="h-10 data-[state=on]:bg-[#03FF24] data-[state=on]:text-black data-[state=on]:shadow-[inset_0px_0px_0px_2px_black] border-2 border-[#03FF24]/50 text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none font-semibold uppercase"
							>
								Instant
							</ToggleGroupItem>
							<ToggleGroupItem
								value="preset"
								className="h-10 data-[state=on]:bg-[#03FF24] data-[state=on]:text-black data-[state=on]:shadow-[inset_0px_0px_0px_2px_black] border-2 border-[#03FF24]/50 text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none font-semibold uppercase"
							>
								Preset
							</ToggleGroupItem>
							<ToggleGroupItem
								value="manual"
								className="h-10 data-[state=on]:bg-[#03FF24] data-[state=on]:text-black data-[state=on]:shadow-[inset_0px_0px_0px_2px_black] border-2 border-[#03FF24]/50 text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none font-semibold uppercase"
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
					rules={{ required: "Please choose a delay", min: { value: 0, message: "Delay must be >= 0" } }}
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
											className="h-8 data-[state=on]:bg-[#03FF24] data-[state=on]:text-black data-[state=on]:shadow-[inset_0px_0px_0px_2px_black] border-2 border-[#03FF24]/50 text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none font-semibold text-xs"
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
										const secs = Math.floor((new Date(inputValue).getTime() - Date.now()) / 1000);
										if (secs < 5 * 60) { toast.error("Minimum delay is 5 minutes"); return; }
										if (secs > 24 * 60 * 60) { toast.error("Maximum delay is 24 hours"); return; }
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
					Delayed start is when trading begins - either after the preset time or at the selected date/time.
				</p>
			</div>
		</FormSection>
	);
};

/* ------------------------------------------------------------------ */
/*  TradeLimitSection                                                  */
/* ------------------------------------------------------------------ */

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
						Max Buy/Sell (SOL) - First 8 Hours
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
						<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#03FF24] font-bold text-sm">SOL</span>
					</div>
					<p className="text-[10px] text-gray-500 mt-1">
						Sets the maximum SOL amount per buy/sell transaction for the first 8 hours after launch.
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

/* ------------------------------------------------------------------ */
/*  PreBuySection                                                      */
/* ------------------------------------------------------------------ */

export const PreBuySection = ({
	idPrefix = "waifu",
	collapsible = true,
	defaultOpen = false,
}: { idPrefix?: string; collapsible?: boolean; defaultOpen?: boolean }) => {
	const {
		registerForm,
		formState: { errors },
		setValue,
	} = usePrompt();
	const address = useAddress();
	const balanceQuery = useBalance({ chain: "solana", address });
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
						Buy Amount (SOL)
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
					<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#03FF24] font-bold text-sm">SOL</span>
				</div>
				{errors.buyAmount && <p className="text-red-500 text-xs mt-1">{errors.buyAmount.message}</p>}
				<div className="flex justify-between items-center mt-1.5">
					<div className="flex items-center gap-2">
						<Wallet size={12} className="text-gray-400" />
						<p className="text-xs text-gray-400">Balance: {balance.toFixed(4)} SOL</p>
					</div>
					<Button
						type="button"
						variant="link"
						onClick={setMaxAmount}
						className="text-xs text-[#03FF24] hover:text-white p-0 h-auto"
					>
						Max
					</Button>
				</div>
				<p className="text-[10px] text-yellow-400 mt-1">Maximum amount based on your balance (max 28 SOL).</p>
			</div>
		</FormSection>
	);
};

/* ------------------------------------------------------------------ */
/*  PoolSelection                                                      */
/* ------------------------------------------------------------------ */

export const PoolSelection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const { pool, setPool } = usePrompt();

	const poolData = [
		{ name: "Meteora", value: "meteora", image: "/pools/meteora.svg" },
		{ name: "Raydium", value: "raydium", image: "/pools/raydium.svg" },
	];

	return (
		<FormSection title="Choose Pool" collapsible={collapsible} defaultOpen={defaultOpen}>
			<ToggleGroup
				type="single"
				value={pool}
				onValueChange={(value) => { if (value) setPool(value); }}
				className="grid grid-cols-2 gap-3"
			>
				{poolData.map((p) => (
					<ToggleGroupItem
						key={p.value}
						value={p.value}
						aria-label={p.name}
						className="h-10 data-[state=on]:bg-[#03FF24] data-[state=on]:text-black data-[state=on]:shadow-[inset_0px_0px_0px_2px_black] border-2 border-[#03FF24]/50 text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none font-semibold uppercase"
					>
						<div className="flex items-center gap-2">
							<img src={p.image} alt={p.name} className="w-4 h-4" />
							{p.name}
						</div>
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</FormSection>
	);
};
