"use client";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle, X } from "lucide-react";

export type DeployStage = {
	label: string;
	status: "pending" | "active" | "success" | "error";
	detail?: string;
};

interface DeployTerminalProps {
	stages: DeployStage[];
	progress?: number;
	onDismiss?: () => void;
	className?: string;
}

const StatusIcon = ({ status }: { status: DeployStage["status"] }) => {
	switch (status) {
		case "success":
			return <CheckCircle2 size={14} className="text-[#00ff87] flex-shrink-0" />;
		case "active":
			return <Loader2 size={14} className="text-[#eab308] animate-spin flex-shrink-0" />;
		case "error":
			return <XCircle size={14} className="text-[#ef4444] flex-shrink-0" />;
		default:
			return <div className="w-3.5 h-3.5 rounded-full border border-[#52525b] flex-shrink-0" />;
	}
};

export function DeployTerminal({ stages, progress = 0, onDismiss, className }: DeployTerminalProps) {
	const [visibleStages, setVisibleStages] = useState<DeployStage[]>([]);
	const [typingIndex, setTypingIndex] = useState(0);

	// Typing effect: gradually reveal stages
	useEffect(() => {
		if (typingIndex >= stages.length) {
			setVisibleStages(stages);
			return undefined;
		}
		const timer = setTimeout(() => {
			setVisibleStages(stages.slice(0, typingIndex + 1));
			setTypingIndex(typingIndex + 1);
		}, 150);
		return () => clearTimeout(timer);
	}, [stages, typingIndex]);

	// Reset typing when stages change significantly
	useEffect(() => {
		if (stages.length < visibleStages.length) {
			setTypingIndex(0);
			setVisibleStages([]);
		}
	}, [stages.length, visibleStages.length]);

	const progressPercent = Math.min(Math.max(progress, 0), 100);
	const progressBarFilled = Math.floor((progressPercent / 100) * 20);
	const progressBarEmpty = 20 - progressBarFilled;

	return (
		<div
			className={cn(
				"relative w-full border border-[rgba(255,255,255,0.08)] rounded-sm bg-[#0a0a0c] p-4 font-mono text-sm",
				className,
			)}
		>
			{/* Header with dismiss button */}
			<div className="flex items-center justify-between mb-3 pb-2 border-b border-[rgba(255,255,255,0.06)]">
				<div className="flex items-center gap-2">
					<span className="text-[#00ff87] text-xs">┌─</span>
					<span className="text-[#a1a1aa] text-xs uppercase tracking-wider">DEPLOY LOG</span>
				</div>
				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="text-[#71717a] hover:text-[#e4e4e7] transition-colors"
						aria-label="Dismiss terminal"
					>
						<X size={16} />
					</button>
				)}
			</div>

			{/* Stage list */}
			<div className="space-y-2 mb-4 min-h-[120px] max-h-[300px] overflow-y-auto">
				{visibleStages.map((stage, index) => (
					<div
						key={`${stage.label}-${index}`}
						className={cn(
							"flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-200",
							stage.status === "active" && "text-[#eab308]",
							stage.status === "success" && "text-[#e4e4e7]",
							stage.status === "error" && "text-[#ef4444]",
							stage.status === "pending" && "text-[#71717a]",
						)}
					>
						<span className="text-[#00ff87] mt-0.5">{">"}</span>
						<StatusIcon status={stage.status} />
						<div className="flex-1 min-w-0">
							<span className="break-words">{stage.label}</span>
							{stage.detail && (
								<span className={cn(
									"ml-2 text-xs",
									stage.status === "success" ? "text-[#00ff87]" : "text-[#a1a1aa]"
								)}>
									{stage.detail}
								</span>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Progress bar */}
			{progress > 0 && (
				<div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.06)]">
					<div className="flex items-center gap-2">
						<div className="flex-1 font-mono text-xs text-[#a1a1aa]">
							<span className="text-[#00ff87]">{"█".repeat(progressBarFilled)}</span>
							<span className="text-[#52525b]">{"░".repeat(progressBarEmpty)}</span>
						</div>
						<span className="text-[#00ff87] text-xs font-bold min-w-[3rem] text-right">
							{progressPercent.toFixed(0)}%
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
