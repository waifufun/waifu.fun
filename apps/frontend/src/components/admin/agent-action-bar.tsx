"use client";

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type AdminAction, type AdminAgent, useAdminAgentAction } from "@/lib/api/admin";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
	agent: AdminAgent;
	token: string | null;
};

const BTN_BASE =
	"text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c0c0e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

const BTN_NEUTRAL =
	"border-white/10 text-neutral-300 hover:border-white/30 hover:text-white focus-visible:ring-white/30";
const BTN_AMBER = "border-amber-500/30 text-amber-300 hover:bg-amber-500/10 focus-visible:ring-amber-400/50";
const BTN_ORANGE = "border-orange-500/30 text-orange-300 hover:bg-orange-500/10 focus-visible:ring-orange-400/50";
const BTN_RED = "border-red-500/40 text-red-300 hover:bg-red-500/10 focus-visible:ring-red-400/60";

const ACTION_LABEL: Record<AdminAction, string> = {
	"pause-brain": "pause brain",
	"resume-brain": "resume brain",
	"freeze-withdrawals": "freeze withdrawals",
	"unfreeze-withdrawals": "unfreeze withdrawals",
	kill: "kill",
};

export default function AgentActionBar({ agent, token }: Props) {
	const mutation = useAdminAgentAction(token);
	const [killOpen, setKillOpen] = useState(false);
	const [killTyped, setKillTyped] = useState("");

	const isKilled = Boolean(agent.killedAt);
	const brainPaused = Boolean(agent.brainPausedAt);
	const withdrawalsFrozen = Boolean(agent.withdrawalsPausedAt);

	const runAction = (action: AdminAction) => {
		mutation.mutate(
			{ agentId: agent.id, action },
			{
				onSuccess: () => {
					toast.success(`${ACTION_LABEL[action]} · ${agent.ticker || agent.name}`);
				},
				onError: (err) => {
					toast.error(`${ACTION_LABEL[action]} failed: ${err.message}`);
				},
			},
		);
	};

	const pending = mutation.isPending;
	const errorMsg = mutation.error instanceof Error ? mutation.error.message : null;

	return (
		<div className="flex flex-col items-end gap-1">
			<div className="flex items-center gap-1 flex-wrap justify-end">
				<button
					type="button"
					className={`${BTN_BASE} ${BTN_AMBER}`}
					disabled={pending || isKilled || brainPaused}
					onClick={() => runAction("pause-brain")}
					aria-label={`Pause brain for ${agent.name}`}
				>
					pause brain
				</button>
				<button
					type="button"
					className={`${BTN_BASE} ${BTN_ORANGE}`}
					disabled={pending || isKilled || withdrawalsFrozen}
					onClick={() => runAction("freeze-withdrawals")}
					aria-label={`Freeze withdrawals for ${agent.name}`}
				>
					freeze
				</button>
				<button
					type="button"
					className={`${BTN_BASE} ${BTN_NEUTRAL}`}
					disabled={pending || isKilled || (!brainPaused && !withdrawalsFrozen)}
					onClick={() => {
						if (brainPaused) runAction("resume-brain");
						else if (withdrawalsFrozen) runAction("unfreeze-withdrawals");
					}}
					aria-label={`Resume ${agent.name}`}
					title={brainPaused ? "Resume brain" : withdrawalsFrozen ? "Unfreeze withdrawals" : "Nothing to resume"}
				>
					resume
				</button>
				<button
					type="button"
					className={`${BTN_BASE} ${BTN_RED}`}
					disabled={pending || isKilled}
					onClick={() => {
						setKillTyped("");
						setKillOpen(true);
					}}
					aria-label={`Kill ${agent.name} permanently`}
				>
					kill
				</button>
			</div>
			{errorMsg ? (
				<p role="alert" className="text-[10px] font-mono text-red-300 max-w-[280px] text-right">
					{errorMsg}
				</p>
			) : null}

			<KillDialog
				open={killOpen}
				agent={agent}
				typed={killTyped}
				onTyped={setKillTyped}
				onClose={() => setKillOpen(false)}
				onConfirm={() => {
					setKillOpen(false);
					runAction("kill");
				}}
				busy={pending}
			/>
		</div>
	);
}

function KillDialog({
	open,
	agent,
	typed,
	onTyped,
	onClose,
	onConfirm,
	busy,
}: {
	open: boolean;
	agent: AdminAgent;
	typed: string;
	onTyped: (s: string) => void;
	onClose: () => void;
	onConfirm: () => void;
	busy: boolean;
}) {
	const expected = agent.name.trim();
	const matches = typed.trim() === expected && expected.length > 0;
	return (
		<Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
			<DialogContent
				className="bg-[#0c0c0e] border border-red-500/40 rounded-md p-6 text-white"
				aria-describedby="admin-kill-desc"
			>
				<DialogHeader>
					<DialogTitle className="text-base font-mono uppercase tracking-wider text-red-300">
						Kill agent · permanent
					</DialogTitle>
					<DialogDescription id="admin-kill-desc" className="text-xs text-neutral-400 leading-relaxed">
						This is irreversible. The agent stops accepting actions and its kill timestamp is recorded on-chain in the
						audit log. Type the agent name exactly to confirm.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (matches && !busy) onConfirm();
					}}
					className="space-y-4 mt-4"
				>
					<div className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono">
						<div className="text-neutral-500">name</div>
						<div className="text-white">{expected}</div>
						<div className="text-neutral-500 mt-2">id</div>
						<div className="text-neutral-300 break-all">{agent.id}</div>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="kill-confirm-input"
							className="text-[10px] font-mono uppercase tracking-wider text-neutral-500"
						>
							type agent name to confirm
						</label>
						<Input
							id="kill-confirm-input"
							autoFocus
							value={typed}
							onChange={(e) => onTyped(e.target.value)}
							placeholder={expected}
							className="font-mono text-sm bg-black/40 border-red-500/30 focus-visible:border-red-400"
							aria-invalid={typed.length > 0 && !matches}
							autoComplete="off"
							spellCheck={false}
						/>
					</div>

					<DialogFooter>
						<DialogClose asChild>
							<button
								type="button"
								className="text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-sm border border-white/10 text-neutral-300 hover:border-white/30 hover:text-white"
								onClick={onClose}
							>
								cancel
							</button>
						</DialogClose>
						<button
							type="submit"
							disabled={!matches || busy}
							className="text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-sm border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
						>
							{busy ? "killing…" : "permanently kill"}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
