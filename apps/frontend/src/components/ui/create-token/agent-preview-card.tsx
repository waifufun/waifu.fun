"use client";

import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import { User, Hash, TrendingUp, Activity } from "lucide-react";
import { useMemo } from "react";

export function AgentPreviewCard() {
	const { watchValue, previousImages, uploadedImage, launchSalt, isGeneratingAddress } = usePrompt();

	const name = watchValue("name") as string || "";
	const symbol = watchValue("symbol") as string || "";
	const description = watchValue("description") as string || "";

	// Generate sample tweet based on name
	const sampleTweet = useMemo(() => {
		if (!name || name.trim() === "") {
			return "gm. your agent is taking shape...";
		}
		return `gm. i'm ${name}. just deployed on-chain. let's make some money.`;
	}, [name]);

	// Get avatar image
	const avatarImage = uploadedImage || previousImages?.[0];

	// Format token address display
	const tokenAddressDisplay = useMemo(() => {
		if (isGeneratingAddress) {
			return "generating...";
		}
		if (launchSalt) {
			// Show a truncated version of the salt
			return `${launchSalt.slice(0, 6)}...${launchSalt.slice(-4)}`;
		}
		return "pending";
	}, [launchSalt, isGeneratingAddress]);

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.08)] rounded-sm p-6 overflow-hidden">
			{/* Corner brackets */}
			<div className="absolute top-0 left-0 w-4 h-4 border-l border-t border-[#00ff87]/35" />
			<div className="absolute top-0 right-0 w-4 h-4 border-r border-t border-[#00ff87]/35" />
			<div className="absolute bottom-0 left-0 w-4 h-4 border-l border-b border-[#00ff87]/35" />
			<div className="absolute bottom-0 right-0 w-4 h-4 border-r border-b border-[#00ff87]/35" />

			{/* Header */}
			<div className="mb-4">
				<div className="flex items-center gap-3 mb-2">
					{/* Avatar */}
					<div className="w-12 h-12 rounded-full bg-[#08080a] border border-[rgba(255,255,255,0.08)] overflow-hidden flex items-center justify-center flex-shrink-0">
						{avatarImage ? (
							<img src={avatarImage} alt="Agent avatar" className="w-full h-full object-cover" />
						) : (
							<User className="w-6 h-6 text-[#52525b]" />
						)}
					</div>

					{/* Name and Ticker */}
					<div className="flex-1 min-w-0">
						<h3 className="text-[#e4e4e7] font-bold text-lg truncate transition-all duration-200">
							{name || "Agent Name"}
						</h3>
						<p className="text-[#00ff87] font-mono text-sm transition-all duration-200">
							{symbol ? `$${symbol}` : "$TICKER"}
						</p>
					</div>
				</div>
			</div>

			{/* Sample Tweet */}
			<div className="mb-4">
				<div className="bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm p-3">
					<div className="flex items-start gap-2 mb-2">
						<div className="w-6 h-6 rounded-full bg-[#111114] flex-shrink-0 overflow-hidden flex items-center justify-center">
							{avatarImage ? (
								<img src={avatarImage} alt="" className="w-full h-full object-cover" />
							) : (
								<User className="w-3 h-3 text-[#52525b]" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-xs text-[#71717a] font-medium mb-1 truncate">
								{name || "Agent"} • <span className="text-[#52525b]">just now</span>
							</p>
							<p className="text-sm text-[#a1a1aa] leading-relaxed transition-all duration-200">
								{sampleTweet}
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Stats */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<span className="text-xs text-[#71717a] font-mono uppercase tracking-wider flex items-center gap-1">
						<Hash size={12} />
						Token Address
					</span>
					<span className="text-xs text-[#a1a1aa] font-mono transition-all duration-200">
						{tokenAddressDisplay}
					</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-xs text-[#71717a] font-mono uppercase tracking-wider flex items-center gap-1">
						<TrendingUp size={12} />
						Market Cap
					</span>
					<span className="text-xs text-[#a1a1aa] font-mono">TBD</span>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-xs text-[#71717a] font-mono uppercase tracking-wider flex items-center gap-1">
						<Activity size={12} />
						Status
					</span>
					<span className="text-xs text-[#00ff87] font-mono">Ready to deploy</span>
				</div>
			</div>
		</div>
	);
}
