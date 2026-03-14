"use client";
import { cn } from "@/lib/utils";
import { CheckCircle2, Copy, Share2, ExternalLink, Loader2, AlertCircle, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ProvisioningJobState } from "@/lib/api";

export type ProvisioningUiState =
	| {
			status: "idle";
	  }
	| {
			status: "requesting";
	  }
	| {
			status: "requested" | "provisioning" | "running" | "completed";
			jobId: string;
			provisioningStatus: ProvisioningJobState;
			progress?: number;
			message?: string;
			webUiUrl?: string;
	  }
	| {
			status: "failed";
			jobId?: string;
			message: string;
	  };

interface DeploySuccessProps {
	agentName: string;
	ticker: string;
	tokenAddress: string;
	imageUrl?: string | undefined;
	onProvisionAgent: () => void;
	onViewToken: () => void;
	provisioningState: ProvisioningUiState;
	className?: string;
}

export function DeploySuccess({
	agentName,
	ticker,
	tokenAddress,
	imageUrl,
	onProvisionAgent,
	onViewToken,
	provisioningState,
	className,
}: DeploySuccessProps) {
	const [copied, setCopied] = useState(false);

	const handleCopyAddress = () => {
		navigator.clipboard.writeText(tokenAddress);
		setCopied(true);
		toast.success("copied.");
		setTimeout(() => setCopied(false), 2000);
	};

	const handleShare = () => {
		const shareText = `deployed $${ticker} on @waifufun`;
		const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
		window.open(twitterUrl, "_blank", "noopener,noreferrer");
	};

	const isProvisioningBusy =
		provisioningState.status === "requesting" ||
		provisioningState.status === "requested" ||
		provisioningState.status === "provisioning";
	const isProvisioningFinished =
		provisioningState.status === "running" || provisioningState.status === "completed";
	const canRetry = provisioningState.status === "failed";

	// Derive headline and subtext based on true state
	const getHeadline = () => {
		if (isProvisioningFinished) return "agent is running";
		if (isProvisioningBusy) return "setting up your agent";
		return "token deployed";
	};

	const getSubtext = () => {
		if (isProvisioningFinished) return "your agent is live and ready to operate.";
		if (isProvisioningBusy) return "provisioning is in progress. this may take a moment.";
		return "token is on-chain. provision an agent to bring it to life.";
	};

	return (
		<div className={cn("w-full max-w-2xl mx-auto", className)}>
			{/* Success Animation */}
			<div className="flex flex-col items-center justify-center mb-8">
				<div className="relative">
					{isProvisioningBusy ? (
						<Loader2 size={64} className="text-[#00ff87] animate-spin" />
					) : (
						<>
							<div
								className="absolute inset-0 rounded-full animate-pulse"
								style={{
									boxShadow: isProvisioningFinished
										? "0 0 24px rgba(0,255,135,0.2)"
										: "0 0 16px rgba(0,255,135,0.1)",
								}}
							/>
							<CheckCircle2
								size={64}
								className={cn(
									"animate-in zoom-in duration-500",
									isProvisioningFinished ? "text-[#00ff87]" : "text-[#00ff87]/70"
								)}
							/>
						</>
					)}
				</div>
				<h1 className="text-2xl font-bold text-[#e4e4e7] mt-6 mb-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
					{getHeadline()}
				</h1>
				<p className="text-[#a1a1aa] text-sm animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
					{getSubtext()}
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
								aria-label="copy address"
							>
								<Copy size={14} className={cn(copied ? "text-[#00ff87]" : "text-[#a1a1aa]")} />
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Provisioning Status Card */}
			<div className="bg-[#0a0a0c] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-250">
				<div className="flex items-center justify-between gap-3 mb-2">
					<h3 className="text-xs font-mono text-[#71717a] uppercase tracking-wider">agent runtime</h3>
					<span
						className={cn(
							"text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm",
							provisioningState.status === "failed" && "text-red-400 bg-red-400/10",
							isProvisioningBusy && "text-[#00ff87] bg-[#00ff87]/10",
							isProvisioningFinished && "text-[#00ff87] bg-[#00ff87]/10",
							provisioningState.status === "idle" && "text-[#71717a] bg-white/5"
						)}
					>
						{provisioningState.status === "idle" && "not started"}
						{provisioningState.status === "requesting" && "requesting"}
						{(provisioningState.status === "requested" || provisioningState.status === "provisioning") &&
							(provisioningState.provisioningStatus === "queued" ||
							provisioningState.provisioningStatus === "requested"
								? "queued"
								: "provisioning")}
						{isProvisioningFinished && "running"}
						{provisioningState.status === "failed" && "failed"}
					</span>
				</div>
				<p className="text-sm text-[#a1a1aa]">
					{provisioningState.status === "idle" &&
						"token deployed. click below to provision a cloud agent."}
					{provisioningState.status === "requesting" && "submitting provisioning request."}
					{(provisioningState.status === "requested" || provisioningState.status === "provisioning") &&
						(provisioningState.message || "provisioning in progress.")}
					{isProvisioningFinished &&
						(provisioningState.message || "agent is running.")}
					{provisioningState.status === "failed" && (provisioningState.message || "provisioning failed.")}
				</p>
				{"jobId" in provisioningState && provisioningState.jobId && (
					<p className="mt-2 text-[10px] font-mono text-[#52525b]">job {provisioningState.jobId}</p>
				)}
				{"progress" in provisioningState &&
					typeof provisioningState.progress === "number" &&
					provisioningState.progress > 0 && (
						<div className="mt-3">
							<div className="h-1.5 w-full rounded-full bg-white/5">
								<div
									className="h-1.5 rounded-full bg-[#00ff87] transition-all duration-500"
									style={{ width: `${Math.max(0, Math.min(100, provisioningState.progress))}%` }}
								/>
							</div>
						</div>
					)}
				{provisioningState.status === "failed" && (
					<div className="mt-3 flex items-center gap-2 text-xs text-red-400">
						<AlertCircle size={14} />
						<span>provisioning did not complete. you can retry.</span>
					</div>
				)}
				{"webUiUrl" in provisioningState && provisioningState.webUiUrl && (
					<button
						type="button"
						onClick={() => window.open(provisioningState.webUiUrl, "_blank", "noopener,noreferrer")}
						className="mt-3 text-xs text-[#00ff87] hover:text-[#5dffb2] uppercase tracking-wider"
					>
						open agent
					</button>
				)}
			</div>

			{/* Action Buttons */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
				<button
					type="button"
					onClick={onProvisionAgent}
					disabled={isProvisioningBusy || isProvisioningFinished}
					className={cn(
						"col-span-1 sm:col-span-3 h-12 font-semibold uppercase tracking-wider rounded-sm transition-all duration-300 flex items-center justify-center gap-2",
						isProvisioningBusy || isProvisioningFinished
							? "bg-[#0f3a24] text-[#9af7c8] cursor-default border border-[#00ff87]/20"
							: canRetry
								? "bg-[#111114] text-[#e4e4e7] border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] hover:bg-[rgba(0,255,135,0.08)]"
								: "bg-[#00ff87] text-[#08080a] hover:bg-[#22c55e]"
					)}
				>
					{isProvisioningBusy ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<Zap size={16} />
					)}
					{provisioningState.status === "idle" && "provision agent"}
					{provisioningState.status === "requesting" && "requesting..."}
					{(provisioningState.status === "requested" || provisioningState.status === "provisioning") &&
						"provisioning..."}
					{isProvisioningFinished && "agent running"}
					{provisioningState.status === "failed" && "retry"}
				</button>

				<button
					type="button"
					onClick={onViewToken}
					className="h-10 bg-[#111114] hover:bg-[#1a1a1f] text-[#e4e4e7] font-medium uppercase text-xs tracking-wider rounded-sm border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] transition-all duration-300 flex items-center justify-center gap-2"
				>
					<ExternalLink size={14} />
					view token
				</button>

				<button
					type="button"
					onClick={handleShare}
					className="h-10 bg-[#111114] hover:bg-[#1a1a1f] text-[#e4e4e7] font-medium uppercase text-xs tracking-wider rounded-sm border border-[rgba(255,255,255,0.08)] hover:border-[#00ff87] transition-all duration-300 flex items-center justify-center gap-2 sm:col-span-2"
				>
					<Share2 size={14} />
					share
				</button>
			</div>

			{/* What's Next Section */}
			<div className="bg-[#0a0a0c] border border-[rgba(255,255,255,0.06)] rounded-sm p-5 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
				<h3 className="text-xs font-mono text-[#71717a] uppercase tracking-wider mb-4">
					next steps
				</h3>
				<ul className="space-y-3 text-sm text-[#a1a1aa]">
					{!isProvisioningFinished && (
						<li className="flex items-start gap-3">
							<span className="text-[#00ff87] mt-0.5 text-xs">1</span>
							<span>provision the agent to make it operational</span>
						</li>
					)}
					<li className="flex items-start gap-3">
						<span className="text-[#00ff87] mt-0.5 text-xs">{isProvisioningFinished ? "1" : "2"}</span>
						<span>configure platforms and integrations on the token page</span>
					</li>
					<li className="flex items-start gap-3">
						<span className="text-[#00ff87] mt-0.5 text-xs">{isProvisioningFinished ? "2" : "3"}</span>
						<span>fund the agent if you want autonomous actions</span>
					</li>
				</ul>
			</div>
		</div>
	);
}
