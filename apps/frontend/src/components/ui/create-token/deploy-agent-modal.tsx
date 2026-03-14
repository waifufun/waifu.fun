"use client";

import { useState, useEffect, useCallback } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
	createAgentForToken,
	getAgentJobStatus,
	type AgentCreateResponse,
	type AgentJobStatus,
} from "@/lib/api";
import {
	Bot,
	Loader2,
	CheckCircle2,
	AlertCircle,
	X,
	MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

type DeployStage = "form" | "deploying" | "success" | "error";

interface DeployAgentModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tokenName?: string | undefined;
	tokenDescription?: string | undefined;
	tokenAddress?: string | undefined;
}

const formElementBaseClass =
	"bg-[#0e0e12] border border-[rgba(255,255,255,0.08)] placeholder-[#52525b] text-sm focus:border-[#00ff87] focus:ring-1 focus:ring-[#00ff87]/30 text-[#e4e4e7] rounded-sm";
const formLabelBaseClass =
	"text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]";

const PLATFORMS = [
	{ id: "twitter", label: "Twitter", icon: "𝕏" },
	{ id: "discord", label: "Discord", icon: "💬" },
	{ id: "telegram", label: "Telegram", icon: "✈️" },
] as const;

const DEPLOY_STAGES: Array<{
	key: AgentJobStatus["state"];
	label: string;
}> = [
	{ key: "queued", label: "Queued" },
	{ key: "provisioning", label: "Provisioning" },
	{ key: "running", label: "Running" },
];

function ProgressTracker({
	currentState,
}: { currentState: AgentJobStatus["state"] }) {
	const stageIndex = DEPLOY_STAGES.findIndex(
		(s) => s.key === currentState,
	);

	return (
		<div className="flex items-center gap-2 w-full">
			{DEPLOY_STAGES.map((stage, i) => {
				const isComplete =
					currentState === "completed" ||
					currentState === "running" ||
					i < stageIndex;
				const isCurrent = i === stageIndex;

				return (
					<div key={stage.key} className="flex items-center gap-2 flex-1">
						<div className="flex flex-col items-center gap-1.5 flex-1">
							<div
								className={cn(
									"h-1.5 w-full rounded-full transition-all duration-500",
									isComplete
										? "bg-[#00ff87]"
										: isCurrent
											? "bg-[#00ff87]/50 animate-pulse"
											: "bg-white/10",
								)}
							/>
							<span
								className={cn(
									"text-[9px] font-mono uppercase tracking-widest",
									isComplete
										? "text-[#00ff87]"
										: isCurrent
											? "text-[#00ff87]/70"
											: "text-[#52525b]",
								)}
							>
								{stage.label}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function DeployAgentModal({
	open,
	onOpenChange,
	tokenName = "",
	tokenDescription = "",
	tokenAddress,
}: DeployAgentModalProps) {
	const [stage, setStage] = useState<DeployStage>("form");
	const [agentName, setAgentName] = useState(tokenName);
	const [agentBio, setAgentBio] = useState(tokenDescription);
	const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
	const [jobStatus, setJobStatus] = useState<AgentJobStatus | null>(null);
	const [agentResult, setAgentResult] = useState<AgentCreateResponse | null>(
		null,
	);
	const [errorMessage, setErrorMessage] = useState("");

	// Sync defaults when modal opens
	useEffect(() => {
		if (open) {
			setAgentName(tokenName);
			setAgentBio(tokenDescription);
			setStage("form");
			setJobStatus(null);
			setAgentResult(null);
			setErrorMessage("");
			setSelectedPlatforms([]);
		}
	}, [open, tokenName, tokenDescription]);

	const togglePlatform = (id: string) => {
		setSelectedPlatforms((prev) =>
			prev.includes(id)
				? prev.filter((p) => p !== id)
				: [...prev, id],
		);
	};

	const pollJobStatus = useCallback(
		async (jobId: string) => {
			let attempts = 0;
			const maxAttempts = 60; // ~2 minutes
			const interval = 2000;

			const poll = async () => {
				if (attempts >= maxAttempts) {
					setStage("error");
					setErrorMessage(
						"Deployment is taking longer than expected. Check the Agents tab on your profile for status.",
					);
					return;
				}

				try {
					const status = await getAgentJobStatus(jobId);
					setJobStatus(status);

					if (
						status.state === "completed" ||
						status.state === "running"
					) {
						setStage("success");
						return;
					}

					if (status.state === "failed") {
						setStage("error");
						setErrorMessage(
							status.message || "Agent deployment failed.",
						);
						return;
					}

					attempts++;
					setTimeout(poll, interval);
				} catch {
					attempts++;
					setTimeout(poll, interval);
				}
			};

			poll();
		},
		[],
	);

	const handleDeploy = async () => {
		if (!agentName.trim()) {
			toast.error("agent name required.");
			return;
		}

		setStage("deploying");
		setJobStatus({ jobId: "", state: "queued" });

		try {
			const result = await createAgentForToken({
				agentName: agentName.trim(),
				agentBio: agentBio.trim() || undefined,
				tokenAddress,
				platforms:
					selectedPlatforms.length > 0
						? selectedPlatforms
						: undefined,
			});

			setAgentResult(result);
			setJobStatus({ jobId: result.jobId, state: "queued" });
			pollJobStatus(result.jobId);
		} catch (error: any) {
			setStage("error");
			setErrorMessage(
				error?.message || "Failed to create agent. Please try again.",
			);
		}
	};

	const canDismiss = stage !== "deploying";

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (canDismiss) onOpenChange(v);
			}}
		>
			<DialogContent
				className={cn(
					"border border-[rgba(255,255,255,0.08)] bg-[#111114] p-0 rounded-sm shadow-2xl shadow-[#00ff87]/5",
					"max-w-md",
				)}
			>
				{/* Header */}
				<div className="relative border-b border-white/6 px-5 pt-5 pb-4">

					<DialogHeader>
						<div className="flex items-center gap-2">
							<Bot className="size-5 text-[#00ff87]" />
							<DialogTitle className="text-sm font-mono uppercase tracking-[0.18em] text-[#e4e4e7]">
								deploy agent
							</DialogTitle>
						</div>
						<DialogDescription className="text-xs text-[#71717a] mt-1">
							{stage === "form" &&
								"configure an agent for this token. it will engage on social platforms automatically."}
							{stage === "deploying" &&
								"deploying agent..."}
							{stage === "success" &&
								"agent is live."}
							{stage === "error" &&
								"deployment failed."}
						</DialogDescription>
					</DialogHeader>

					{canDismiss && (
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="absolute top-4 right-4 text-[#52525b] hover:text-[#e4e4e7] transition-colors"
						>
							<X className="size-4" />
						</button>
					)}
				</div>

				{/* Body */}
				<div className="px-5 pb-5 pt-3">
					{stage === "form" && (
						<div className="space-y-4">
							<div>
								<Label
									htmlFor="agent-name"
									className={formLabelBaseClass}
								>
									Agent Name{" "}
									<span className="text-red-500">*</span>
								</Label>
								<Input
									id="agent-name"
									value={agentName}
									onChange={(e) =>
										setAgentName(e.target.value)
									}
									placeholder="My Token Agent"
									className={cn(
										formElementBaseClass,
										"mt-1.5 h-10",
									)}
								/>
							</div>

							<div>
								<Label
									htmlFor="agent-bio"
									className={formLabelBaseClass}
								>
									Agent Bio / Description
								</Label>
								<textarea
									id="agent-bio"
									value={agentBio}
									onChange={(e) =>
										setAgentBio(e.target.value)
									}
									placeholder="A brief description of your agent's personality and purpose..."
									rows={3}
									className={cn(
										formElementBaseClass,
										"mt-1.5 w-full px-3 py-2 resize-none",
									)}
								/>
							</div>

							<div>
								<Label className={formLabelBaseClass}>
									Platforms
								</Label>
								<p className="text-[10px] text-[#52525b] mt-0.5 mb-2">
									Choose where your agent will be active.
								</p>
								<div className="grid grid-cols-3 gap-2">
									{PLATFORMS.map((platform) => {
										const selected =
											selectedPlatforms.includes(
												platform.id,
											);
										return (
											<button
												key={platform.id}
												type="button"
												onClick={() =>
													togglePlatform(platform.id)
												}
												className={cn(
													"flex flex-col items-center gap-1 py-2.5 px-2 rounded-sm border text-xs font-mono uppercase tracking-wider transition-all",
													selected
														? "border-[#00ff87]/40 bg-[#00ff87]/10 text-[#00ff87]"
														: "border-white/8 bg-white/3 text-[#71717a] hover:border-white/15 hover:text-[#a1a1aa]",
												)}
											>
												<span className="text-base">
													{platform.icon}
												</span>
												<span className="text-[9px]">
													{platform.label}
												</span>
											</button>
										);
									})}
								</div>
							</div>

							<div className="flex gap-2 pt-2">
								<Button
									variant="outline"
									onClick={() => onOpenChange(false)}
									className="flex-1 h-10 text-xs font-mono uppercase text-[#71717a] hover:text-[#e4e4e7] border-white/10"
								>
									I'll do this later
								</Button>
								<Button
									onClick={handleDeploy}
									disabled={!agentName.trim()}
									className="flex-1 h-10 text-xs font-mono uppercase"
								>
									<Bot className="size-3.5" />
									Deploy Agent
								</Button>
							</div>
						</div>
					)}

					{stage === "deploying" && jobStatus && (
						<div className="space-y-5 py-2">
							<ProgressTracker
								currentState={jobStatus.state}
							/>

							<div className="flex flex-col items-center gap-3 py-4">
								<Loader2 className="size-8 text-[#00ff87] animate-spin" />
								<p className="text-sm text-[#a1a1aa] text-center">
									{jobStatus.state === "queued" &&
										"Your agent is in the queue..."}
									{jobStatus.state === "provisioning" &&
										"Setting up your agent's environment..."}
								</p>
								{jobStatus.progress != null &&
									jobStatus.progress > 0 && (
										<div className="w-full bg-white/5 rounded-full h-1.5">
											<div
												className="bg-[#00ff87] h-1.5 rounded-full transition-all duration-500"
												style={{
													width: `${jobStatus.progress}%`,
												}}
											/>
										</div>
									)}
							</div>

							<p className="text-[10px] text-[#52525b] text-center">
								This may take a minute. You can close this dialog
								— deployment will continue in the background.
							</p>

							<Button
								variant="outline"
								onClick={() => onOpenChange(false)}
								className="w-full h-9 text-xs font-mono uppercase text-[#71717a] hover:text-[#e4e4e7] border-white/10"
							>
								Close &amp; Continue
							</Button>
						</div>
					)}

					{stage === "success" && (
						<div className="space-y-4 py-2">
							<div className="flex flex-col items-center gap-3 py-4">
								<div className="relative">
									<CheckCircle2 className="size-10 text-[#00ff87]" />
									<div
										className="absolute inset-0 rounded-full animate-ping"
										style={{
											boxShadow:
												"0 0 20px rgba(0,255,135,0.3)",
										}}
									/>
								</div>
								<p className="text-sm font-semibold text-[#e4e4e7]">
									Agent Deployed!
								</p>
								<p className="text-xs text-[#71717a] text-center">
									Your AI agent{" "}
									<span className="text-[#00ff87]">
										{agentName}
									</span>{" "}
									is now running.
								</p>
							</div>

							{selectedPlatforms.length > 0 && (
								<div className="flex items-center justify-center gap-2">
									<MessageSquare className="size-3 text-[#52525b]" />
									<span className="text-[10px] text-[#52525b] font-mono uppercase">
										Active on:{" "}
										{selectedPlatforms.join(", ")}
									</span>
								</div>
							)}

							<Button
								onClick={() => onOpenChange(false)}
								className="w-full h-10 text-xs font-mono uppercase"
							>
								Done
							</Button>
						</div>
					)}

					{stage === "error" && (
						<div className="space-y-4 py-2">
							<div className="flex flex-col items-center gap-3 py-4">
								<AlertCircle className="size-10 text-red-400" />
								<p className="text-sm font-semibold text-[#e4e4e7]">
									Deployment Failed
								</p>
								<p className="text-xs text-[#71717a] text-center max-w-sm">
									{errorMessage}
								</p>
							</div>

							<div className="flex gap-2">
								<Button
									variant="outline"
									onClick={() => onOpenChange(false)}
									className="flex-1 h-9 text-xs font-mono uppercase text-[#71717a] hover:text-[#e4e4e7] border-white/10"
								>
									Close
								</Button>
								<Button
									onClick={() => {
										setStage("form");
										setErrorMessage("");
									}}
									className="flex-1 h-9 text-xs font-mono uppercase"
								>
									Try Again
								</Button>
							</div>
						</div>
					)}
				</div>

			</DialogContent>
		</Dialog>
	);
}
