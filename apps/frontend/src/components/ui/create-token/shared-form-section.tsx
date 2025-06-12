"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/create-token/textarea";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Slider } from "@/components/ui/create-token/slider";
import { FormSection } from "./form-section";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

const formElementBaseClass =
	"bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)]";
const formLabelBaseClass = "text-xs text-gray-400 uppercase tracking-wider font-semibold";
const sliderThumbClass =
	"block h-5 w-5 rounded-none bg-[#03FF24] border-2 border-black ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-[2px_2px_0px_black]";
const sliderTrackClass = "relative h-2 w-full grow overflow-hidden rounded-none bg-black/50 border border-[#03FF24]/50";
const sliderRangeClass = "absolute h-full bg-[#03FF24]";

export const CoinInfoFields = ({
	idPrefix,
	collapsible = false,
	defaultOpen = true,
}: { idPrefix: string; collapsible?: boolean; defaultOpen?: boolean }) => (
	<FormSection title="Coin Info" collapsible={collapsible} defaultOpen={defaultOpen}>
		<div className="grid sm:grid-cols-2 gap-4">
			<div>
				<Label htmlFor={`${idPrefix}Name`} className={formLabelBaseClass}>
					Name
				</Label>
				<Input type="text" id={`${idPrefix}Name`} className={cn(formElementBaseClass, "mt-1 h-10")} />
			</div>
			<div>
				<Label htmlFor={`${idPrefix}Ticker`} className={formLabelBaseClass}>
					Ticker
				</Label>
				<Input type="text" id={`${idPrefix}Ticker`} placeholder="$" className={cn(formElementBaseClass, "mt-1 h-10")} />
			</div>
		</div>
		<div>
			<Label htmlFor={`${idPrefix}Description`} className={formLabelBaseClass}>
				Description
			</Label>
			<Textarea id={`${idPrefix}Description`} className={cn(formElementBaseClass, "mt-1 min-h-[80px]")} />
		</div>
	</FormSection>
);

export const CustomAddressGenerator = ({
	idPrefix,
	collapsible = true,
	defaultOpen = false,
}: { idPrefix: string; collapsible?: boolean; defaultOpen?: boolean }) => (
	<FormSection title="Generate Custom Address" collapsible={collapsible} defaultOpen={defaultOpen}>
		<div className="flex items-end gap-2">
			<div className="flex-grow">
				<Label htmlFor={`${idPrefix}CustomAddress`} className={formLabelBaseClass}>
					Prefix / Suffix
				</Label>
				<Input
					type="text"
					id={`${idPrefix}CustomAddress`}
					defaultValue="FUN"
					className={cn(formElementBaseClass, "mt-1 h-10 uppercase")}
				/>
			</div>
			<Button
				variant="outline"
				className="h-10 border-2 border-[#03FF24]/70 text-[#03FF24] hover:bg-[#03FF24]/20 hover:border-[#03FF24] rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.3)] font-bold uppercase text-xs px-3"
			>
				Generate
			</Button>
		</div>
		<p className="text-xs text-[#03FF24] font-mono break-all bg-black/40 p-2 border border-[#03FF24]/30 rounded-none shadow-inner">
			12FmM4TY8S9Ck3wCvYR5gkbUuGrAC5V4WmiwdQmFUN
		</p>
		<p className="text-[10px] text-gray-500">ⓘ Longer suffixes are slower to generate.</p>
	</FormSection>
);

export const CustomCurveSection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const [raiseAmount, setRaiseAmount] = useState(150);
	return (
		<FormSection title="Custom Curve" collapsible={collapsible} defaultOpen={defaultOpen}>
			<div>
				<div className="flex justify-between items-center mb-1">
					<Label htmlFor="raiseAmount" className={formLabelBaseClass}>
						Raise Amount
					</Label>
					<span className="text-sm font-bold text-[#03FF24]">{raiseAmount} SOL</span>
				</div>
				<Slider
					id="raiseAmount"
					min={85}
					max={350}
					step={1}
					value={[raiseAmount]}
					onValueChange={(value) => setRaiseAmount(value[0])}
					className="w-full"
					thumbClassName={sliderThumbClass}
					trackClassName={sliderTrackClass}
					rangeClassName={sliderRangeClass}
				/>
			</div>
		</FormSection>
	);
};

export const DelayedStartSection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const [isDelayEnabled, setIsDelayEnabled] = useState(false);

	return (
		<FormSection title="Delayed Start" collapsible={collapsible} defaultOpen={defaultOpen}>
			<div className="flex items-center justify-between">
				<Label htmlFor="enable-delayed-start" className={cn(formLabelBaseClass, "cursor-pointer")}>
					Enable Delayed Start
				</Label>
				<Switch
					id="enable-delayed-start"
					checked={isDelayEnabled}
					onCheckedChange={setIsDelayEnabled}
					className="data-[state=checked]:bg-[#03FF24] rounded-none [&>span]:rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.25)]"
				/>
			</div>
			<p className="text-[10px] text-gray-500 mt-1">If enabled, trading will start after a fixed delay period.</p>
		</FormSection>
	);
};

export const TradeLimitSection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => {
	const [tradeLimitSol, setTradeLimitSol] = useState(0.1); // Default to 0.1 SOL
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
							value={tradeLimitSol}
							onChange={(e) => {
								const val = Number.parseFloat(e.target.value);
								if (!isNaN(val) && val >= 0) {
									setTradeLimitSol(val);
								} else if (e.target.value === "") {
									setTradeLimitSol(0);
								}
							}}
							min="0"
							step="0.01" // Allow for smaller SOL increments
							className={cn(formElementBaseClass, "h-10 pr-16")} // Added pr-16 for SOL text
						/>
						<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#03FF24] font-bold text-sm">SOL</span>
					</div>
					<p className="text-[10px] text-gray-500 mt-1">
						Sets the maximum SOL amount per buy/sell transaction for the first 8 hours after launch.
					</p>
				</div>
			</div>
		</FormSection>
	);
};

export const PreBuySection = ({
	idPrefix,
	collapsible = true,
	defaultOpen = false,
}: { idPrefix: string; collapsible?: boolean; defaultOpen?: boolean }) => (
	<FormSection title="Pre-buy" collapsible={collapsible} defaultOpen={defaultOpen}>
		<div>
			<Label htmlFor={`${idPrefix}BuyAmount`} className={formLabelBaseClass}>
				Buy Amount (SOL)
			</Label>
			<div className="relative mt-1">
				<Input
					type="number"
					id={`${idPrefix}BuyAmount`}
					defaultValue="0.0000"
					className={cn(formElementBaseClass, "h-10 pr-16")}
				/>
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#03FF24] font-bold text-sm">SOL</span>
			</div>
			<div className="flex justify-between items-center mt-1.5">
				<p className="text-xs text-gray-400">Balance: 0.00 SOL</p>
				<Button variant="link" className="text-xs text-[#03FF24] hover:text-white p-0 h-auto">
					Max
				</Button>
			</div>
			<p className="text-[10px] text-yellow-400 mt-1">Maximum amount based on your fee tier.</p>
		</div>
	</FormSection>
);

export const PoolSelection = ({
	collapsible = true,
	defaultOpen = false,
}: { collapsible?: boolean; defaultOpen?: boolean }) => (
	<FormSection title="Choose Pool" collapsible={collapsible} defaultOpen={defaultOpen}>
		<ToggleGroup type="single" defaultValue="meteora" className="grid grid-cols-2 gap-3">
			<ToggleGroupItem
				value="meteora"
				aria-label="Meteora"
				className="h-10 data-[state=on]:bg-[#03FF24] data-[state=on]:text-black data-[state=on]:shadow-[inset_0px_0px_0px_2px_black] border-2 border-[#03FF24]/50 text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none font-semibold uppercase"
			>
				Meteora
			</ToggleGroupItem>
			<ToggleGroupItem
				value="raydium"
				aria-label="Raydium"
				className="h-10 data-[state=on]:bg-[#03FF24] data-[state=on]:text-black data-[state=on]:shadow-[inset_0px_0px_0px_2px_black] border-2 border-[#03FF24]/50 text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none font-semibold uppercase"
			>
				Raydium
			</ToggleGroupItem>
		</ToggleGroup>
	</FormSection>
);

export const LaunchButton = () => (
	<Button className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-lg py-3 h-auto rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider">
		Launch Token
	</Button>
);
