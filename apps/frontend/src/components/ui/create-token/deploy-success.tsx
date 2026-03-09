"use client";
import { cn } from "@/lib/utils";
import { CheckCircle2, Copy, Share2, ExternalLink, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DeploySuccessProps {
	agentName: string;
	ticker: string;
	tokenAddress: string;
	imageUrl?: string | undefined;
	onDeployAgent: () => void;
	onViewToken: () => void;
	className?: string;
}

export function DeploySuccess({
	agentName,
	ticker,
	tokenAddress,
	imageUrl,
	onDeployAgent,
	onViewToken,
	className,
}: DeploySuccessProps) {
	const [copied, setCopied] = useState(false);

	const handleCopyAddress = () => {
		navigator.clipboard.writeText(tokenAddress);
		setCopied(true);
		toast.success("Address copied!");
		setTimeout(() => setCopied(false), 2000);
	};

	const handleShare = () => {
		const shareText = `I just deployed $${ticker} on @waifufun 🚀`;
		const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
		window.open(twitterUrl, "_blank", "noopener,noreferrer");
	};

	return (
		<div className={cn("w-full max-w-2xl mx-auto", className)}>
			{/* Success Animation */}
			<div className="flex flex-col items-center justify-center mb-8">
				<div className="relative">
					<div
						className="absolute inset-0 rounded-full animate-pulse"
						style={{
							boxShadow: "0 0 60px rgba(0,255,135,0.4), 0 0 100px rgba(0,255,135,0.2)",
						}}
					/>
					<CheckCircle2 
						size={80} 
						className="text-[#00ff87] animate-in zoom-in duration-500" 
					/>
				</div>
				<h1 className="text-3xl font-bold text-[#e4e4e7] mt-6 mb-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
					Your agent is live!
				</h1>
				<p className="text-[#a1a1aa] text-sm animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
					Token successfully deployed to the blockchain
				</p>
			</div>

			{/* Token Info Card */}
			<div className="bg-[#111114] border border-[rgba(255,255,255,0.08)] rounded-sm p-6 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
				<div className="flex items-start gap-4">
					{imageUrl && (
						<img
							src={imageUrl}
							alt={agentName}
							className="w-20 h-20 rounded-sm object-cover border border-[rgba(255,255,255,0.08)]"
						/>
					)}
					<div className="flex-1 min-w-0">
						<h2 className="text-xl font-bold text-[#e4e4e7] mb-1">{agentName}</h2>
						<p className="text-[#00ff87] font-mono text-lg mb-3">${ticker}</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 text-xs font-mono text-[#a1a1aa] bg-[#0a0a0c] px-3 py-2 rounded-sm border border-[rgba(255,255,255,0.06)] truncate">
								{tokenAddress}
							</code>
							<button
								type="button"
								onClick={handleCopyAddress}
								className="p-2 rounded-sm border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] hover:bg-[rgba(0,255,135,0.08)] transition-colors"
								aria-label="Copy address"
							>
								<Copy size={14} className={cn(copied ? "text-[#00ff87]" : "text-[#a1a1aa]")} />
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Action Buttons */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
				<button
					type="button"
					onClick={onDeployAgent}
					className="col-span-1 sm:col-span-3 h-14 bg-[#00ff87] hover:bg-[#22c55e] text-[#08080a] font-bold uppercase tracking-wider rounded-sm transition-all duration-300 flex items-center justify-center gap-2 group"
					style={{ boxShadow: "0 0 20px rgba(0,255,135,0.3)" }}
				>
					<Sparkles size={18} className="group-hover:animate-pulse" />
					Deploy AI Agent
				</button>
				
				<button
					type="button"
					onClick={onViewToken}
					className="h-12 bg-[#111114] hover:bg-[#1a1a1f] text-[#e4e4e7] font-semibold uppercase text-sm tracking-wider rounded-sm border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] transition-all duration-300 flex items-center justify-center gap-2"
				>
					<ExternalLink size={16} />
					View Token Page
				</button>
				
				<button
					type="button"
					onClick={handleShare}
					className="h-12 bg-[#111114] hover:bg-[#1a1a1f] text-[#e4e4e7] font-semibold uppercase text-sm tracking-wider rounded-sm border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] transition-all duration-300 flex items-center justify-center gap-2 sm:col-span-2"
				>
					<Share2 size={16} />
					Share on Twitter
				</button>
			</div>

			{/* What's Next Section */}
			<div className="bg-[#0a0a0c] border border-[rgba(255,255,255,0.06)] rounded-sm p-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
				<h3 className="text-sm font-bold text-[#e4e4e7] uppercase tracking-wider mb-4 flex items-center gap-2">
					<span className="text-[#00ff87]">→</span>
					What's next?
				</h3>
				<ul className="space-y-3 text-sm text-[#a1a1aa]">
					<li className="flex items-start gap-3">
						<span className="text-[#00ff87] mt-0.5">•</span>
						<span>Fund your agent with tokens for autonomous trading</span>
					</li>
					<li className="flex items-start gap-3">
						<span className="text-[#00ff87] mt-0.5">•</span>
						<span>Configure social platforms for your agent</span>
					</li>
					<li className="flex items-start gap-3">
						<span className="text-[#00ff87] mt-0.5">•</span>
						<span>Watch your agent's first interactions</span>
					</li>
				</ul>
			</div>
		</div>
	);
}
