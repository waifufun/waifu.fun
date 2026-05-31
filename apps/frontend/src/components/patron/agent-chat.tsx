"use client";

import { type AgentChatErrorState, type AgentDetail, chatErrorState, useAgentChat } from "@/lib/api/patron";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
	/**
	 * Route identifier the patron navigated to (persona id or agent slug). This
	 * is the value requireAgentOwnership() resolves on the API side, mirroring
	 * XConnectionPanel / PolicyEditor. The agent detail payload keys off
	 * `agentId`, not a top-level `id`, so we take the route param explicitly
	 * rather than reading `agent.id`.
	 */
	agentId: string;
	agent: AgentDetail | undefined;
	isLoading: boolean;
};

type ChatTurn = {
	id: string;
	role: "patron" | "agent";
	text: string;
	at: number;
	pending?: boolean;
	failed?: boolean;
};

// Derived gate. The dashboard already distinguishes owner views; this only
// decides which *chat surface* to show: live exchange, the pre-bond waiting
// state, or the dormant/out-of-credits state.
type ChatGate = "live" | "provisioning" | "dormant" | "killed";

function deriveGate(agent: AgentDetail | undefined): ChatGate {
	if (!agent) return "provisioning";
	if (agent.status === "killed") return "killed";
	if (agent.status === "dormant") return "dormant";
	// provisioned = token not yet bonded / no live runtime to talk to.
	if (agent.status === "provisioned") return "provisioning";
	// active but no hosted runtime url yet means the container is still coming up.
	const hasRuntime = Boolean(agent.runtime?.webUiUrl ?? agent.runtime?.cloudAgentId ?? agent.tokenAddress);
	if (!hasRuntime) return "provisioning";
	// active with a near-zero runway reads as out-of-credits, not live.
	if (typeof agent.runwayDays === "number" && agent.runwayDays <= 0) return "dormant";
	return "live";
}

function Pulse({ tone = "accent" }: { tone?: "accent" | "negative" | "neutral" }) {
	const color = tone === "negative" ? "var(--negative)" : tone === "neutral" ? "var(--text-tertiary)" : "var(--accent)";
	return (
		<span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden>
			{tone === "accent" ? (
				<span
					className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
					style={{ backgroundColor: color }}
				/>
			) : null}
			<span
				className="relative inline-flex h-1.5 w-1.5 rounded-full"
				style={{ backgroundColor: color, boxShadow: tone === "accent" ? `0 0 6px ${color}` : undefined }}
			/>
		</span>
	);
}

function formatClock(at: number): string {
	const d = new Date(at);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const PANEL = "rounded-sm border border-stroke bg-[#0C0C0C]";

function ChatHeader({ right }: { right?: React.ReactNode }) {
	return (
		<header className="flex items-center justify-between border-b border-stroke px-4 py-3">
			<div className="flex items-center gap-2">
				<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">chat</h2>
			</div>
			{right}
		</header>
	);
}

function NonLiveState({ gate, agent }: { gate: Exclude<ChatGate, "live">; agent: AgentDetail | undefined }) {
	const ticker = agent?.ticker ? agent.ticker.toUpperCase() : "your agent";
	const copy =
		gate === "killed"
			? {
					tone: "negative" as const,
					label: "killed",
					line: "this agent is permanently killed. chat is closed.",
				}
			: gate === "dormant"
				? {
						tone: "negative" as const,
						label: "dormant",
						line: "out of credits. top up the treasury to wake it, then chat goes live.",
					}
				: {
						tone: "neutral" as const,
						label: "pre-bond",
						line: `${ticker} goes live when the token bonds. chat opens the moment the runtime is up.`,
					};
	return (
		<section aria-label="chat" className={PANEL}>
			<ChatHeader
				right={
					<span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
						<Pulse tone={copy.tone} />
						{copy.label}
					</span>
				}
			/>
			<div className="px-4 py-8">
				<p className="font-mono text-[11px] leading-relaxed text-neutral-400 max-w-[52ch]">{copy.line}</p>
			</div>
		</section>
	);
}

export default function AgentChat({ agentId, agent, isLoading }: Props) {
	const gate = deriveGate(agent);
	const chat = useAgentChat(agentId);
	const [turns, setTurns] = useState<ChatTurn[]>([]);
	const [draft, setDraft] = useState("");
	const [sessionId, setSessionId] = useState<string | undefined>(undefined);
	const [softError, setSoftError] = useState<{ state: AgentChatErrorState; message: string } | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const live = gate === "live";
	const pending = chat.isPending;
	const turnCount = turns.length;

	// Keep the transcript pinned to the latest turn (and to the typing
	// indicator while a reply is in flight). turnCount + pending are read so the
	// effect re-runs on each new turn and when the typing indicator toggles.
	useEffect(() => {
		void turnCount;
		void pending;
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [turnCount, pending]);

	const send = useCallback(async () => {
		const text = draft.trim();
		if (!text || chat.isPending || !agentId) return;
		setSoftError(null);
		const turnId = crypto.randomUUID();
		const sentAt = Date.now();
		setTurns((prev) => [...prev, { id: turnId, role: "patron", text, at: sentAt }]);
		setDraft("");
		// reset textarea height after clearing
		if (inputRef.current) inputRef.current.style.height = "auto";

		try {
			const reply = await chat.mutateAsync({ text, ...(sessionId ? { sessionId } : {}) });
			if (reply.sessionId) setSessionId(reply.sessionId);
			setTurns((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					role: "agent",
					text: reply.reply ?? "(no reply)",
					at: Date.now(),
				},
			]);
		} catch (err) {
			const state = chatErrorState(err);
			const message =
				err && typeof err === "object" && "message" in err
					? String((err as { message: unknown }).message)
					: "send failed";
			setSoftError({ state, message });
			setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, failed: true } : t)));
		}
	}, [draft, chat, sessionId, agentId]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	};

	const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setDraft(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	};

	const statusRight = useMemo(
		() => (
			<span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
				<Pulse tone="accent" />
				{chat.isPending ? "typing" : "live"}
			</span>
		),
		[chat.isPending],
	);

	if (isLoading && !agent) {
		return (
			<section aria-label="chat" className={cn(PANEL, "animate-pulse")}>
				<ChatHeader />
				<div className="space-y-3 px-4 py-5">
					<div className="h-8 w-2/3 rounded bg-[#141414]" />
					<div className="ml-auto h-8 w-1/2 rounded bg-[#141414]" />
					<div className="h-8 w-3/5 rounded bg-[#141414]" />
				</div>
			</section>
		);
	}

	if (!live) {
		return <NonLiveState gate={gate} agent={agent} />;
	}

	return (
		<section aria-label="chat" className={cn(PANEL, "flex flex-col")}>
			<ChatHeader right={statusRight} />

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 min-h-[280px] max-h-[440px]" aria-live="polite">
				{turns.length === 0 ? (
					<p className="font-mono text-[11px] text-neutral-500">say something. only you can talk to this agent.</p>
				) : (
					<ul className="space-y-3">
						{turns.map((turn) => (
							<li key={turn.id} className="flex flex-col gap-0.5">
								<div className="flex items-baseline gap-2">
									<span
										className={cn(
											"font-mono text-[10px] uppercase tracking-[0.18em]",
											turn.role === "agent" ? "text-[var(--accent)]" : "text-white/55",
										)}
									>
										{turn.role === "agent" ? (agent?.ticker?.toLowerCase() ?? "agent") : "you"}
									</span>
									<span className="font-mono text-[9px] tabular-nums text-neutral-600">{formatClock(turn.at)}</span>
									{turn.failed ? (
										<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--negative)]">
											failed
										</span>
									) : null}
								</div>
								<p
									className={cn(
										"whitespace-pre-wrap break-words text-[13px] leading-relaxed",
										turn.role === "agent" ? "text-neutral-200" : "text-neutral-300",
										turn.failed && "text-neutral-500 line-through decoration-[var(--negative)]/40",
									)}
								>
									{turn.text}
								</p>
							</li>
						))}
						{chat.isPending ? (
							<li className="flex items-center gap-2">
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
									{agent?.ticker?.toLowerCase() ?? "agent"}
								</span>
								<span className="inline-flex gap-1" aria-label="agent is typing">
									<span className="h-1 w-1 animate-pulse rounded-full bg-[var(--accent)]" />
									<span className="h-1 w-1 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
									<span className="h-1 w-1 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:300ms]" />
								</span>
							</li>
						) : null}
					</ul>
				)}
			</div>

			{softError ? (
				<p role="alert" className="border-t border-stroke px-4 py-2 font-mono text-[11px] text-[var(--negative)]">
					{softError.state === "dormant"
						? "agent went dormant. top up credits to keep talking."
						: softError.state === "provisioning"
							? "runtime not up yet. try again in a moment."
							: softError.message}
				</p>
			) : null}

			<div className="flex items-end gap-2 border-t border-stroke px-3 py-3">
				<textarea
					ref={inputRef}
					value={draft}
					onChange={autoGrow}
					onKeyDown={handleKeyDown}
					rows={1}
					placeholder="message your agent"
					disabled={chat.isPending}
					className="flex-1 resize-none bg-transparent font-mono text-[13px] leading-relaxed text-neutral-200 placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
				/>
				<button
					type="button"
					onClick={() => void send()}
					disabled={chat.isPending || draft.trim().length === 0}
					className="shrink-0 rounded-sm border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{chat.isPending ? "sending" : "send"}
				</button>
			</div>
		</section>
	);
}
