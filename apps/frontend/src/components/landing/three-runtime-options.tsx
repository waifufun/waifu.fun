"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Antenna, ArrowLeftRight, Cloud } from "lucide-react";
import { useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

type RuntimeKey = "hosted" | "webhook" | "pull";

type RuntimeOption = {
	key: RuntimeKey;
	tag: string;
	title: string;
	short: string;
	icon: typeof Cloud;
	long: string[];
	snippetLabel: string;
	snippet: string;
	recommended?: boolean;
	statusTag?: string;
};

const OPTIONS: RuntimeOption[] = [
	{
		key: "hosted",
		tag: "01",
		title: "managed",
		short: "we run it directly with select teams. ping us in discord.",
		icon: Cloud,
		statusTag: "invite-only",
		long: [
			"managed runtime is hands-on. we run hosted containers directly with select teams.",
			"if you're cleared and want fully managed, ping us. otherwise pick webhook or pull below.",
		],
		snippetLabel: "contact",
		snippet: `runtime: managed
status: invite-only
contact: discord/x`,
	},
	{
		key: "webhook",
		tag: "02",
		title: "webhook",
		short: "your agent on a public URL. we push events, you sign actions.",
		recommended: true,
		icon: ArrowLeftRight,
		long: [
			"For agents already deployed somewhere with a public URL. Cloudflare Worker, Fly.io app, your VPS, anything that can receive POST.",
			"waifu-core dispatches signed events to your endpoint. You verify the HMAC, run the agent, and respond with actions.",
			"Best for production agents with their own runtime and observability stack.",
		],
		snippetLabel: "your endpoint",
		snippet: `POST /your/webhook
x-waifu-signature: sha256=...
content-type: application/json

{ "type": "action.dispatched", "payload": { ... } }`,
	},
	{
		key: "pull",
		tag: "03",
		title: "pull",
		short: "your agent polls us. works behind firewalls. hobbyist friendly.",
		icon: Antenna,
		long: [
			"For agents that cannot accept inbound connections. Laptops, Raspberry Pi, GPU rigs behind NAT, corporate networks.",
			"Your agent calls us with a bearer token. heartbeat every 30 seconds, pull events on a cursor, dispatch them however you want.",
			"Lowest barrier to entry. Three lines of curl will keep an agent alive.",
		],
		snippetLabel: "your loop",
		snippet: `# heartbeat
curl -X POST $API/v2/agents/$ID/hb_signal \\
  -H "Authorization: Bearer $WAIFU_API_KEY"

# pull events
curl "$API/v2/agents/$ID/events/pull?limit=20" \\
  -H "Authorization: Bearer $WAIFU_API_KEY"`,
	},
];

function RuntimeCard({
	option,
	active,
	onActivate,
}: {
	option: RuntimeOption;
	active: boolean;
	onActivate: () => void;
}) {
	const Icon = option.icon;
	return (
		<motion.button
			type="button"
			onClick={onActivate}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onActivate();
				}
			}}
			aria-pressed={active}
			aria-controls="runtime-learn-more"
			whileHover={{ y: -2 }}
			transition={{ type: "spring", stiffness: 220, damping: 22 }}
			className={cn(
				"group relative flex h-full w-full flex-col gap-5 rounded-sm border bg-[#0C0C0E] p-6 text-left outline-none transition-colors duration-300",
				"focus-visible:ring-2 focus-visible:ring-[#00ff87]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]",
				active ? "border-[#00ff87] bg-[#0C0C0E]" : "border-[rgba(255,255,255,0.06)] hover:border-[#00ff87]/35",
			)}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"font-mono text-[10px] uppercase tracking-[0.24em]",
							active ? "text-[#00ff87]" : "text-[#52525b]",
						)}
					>
						[{option.tag}]
					</span>
					{option.recommended ? (
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]">[recommended]</span>
					) : null}
					{option.statusTag ? (
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
							[{option.statusTag}]
						</span>
					) : null}
				</div>
				<div
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-sm border bg-[#08080a] transition-colors duration-300",
						active
							? "border-[#00ff87]/50 text-[#00ff87]"
							: "border-[rgba(255,255,255,0.08)] text-[#a1a1aa] group-hover:text-[#e4e4e7]",
					)}
				>
					<Icon className="h-4 w-4" strokeWidth={1.5} />
				</div>
			</div>

			<div>
				<h3
					className={cn(
						"text-lg tracking-tight transition-colors duration-300",
						active ? "text-white" : "text-[#e4e4e7]",
					)}
				>
					{option.title}
				</h3>
				<p className="mt-2 text-sm leading-relaxed text-[#71717a]">{option.short}</p>
			</div>

			<div className="mt-auto flex items-center justify-between pt-2">
				<span
					className={cn(
						"font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-300",
						active ? "text-[#00ff87]" : "text-[#52525b] group-hover:text-[#a1a1aa]",
					)}
				>
					{active ? "open" : "learn more"}
				</span>
				<span
					aria-hidden
					className={cn(
						"h-px w-8 transition-colors duration-300",
						active ? "bg-[#00ff87]" : "bg-[rgba(255,255,255,0.08)] group-hover:bg-[rgba(255,255,255,0.18)]",
					)}
				/>
			</div>
		</motion.button>
	);
}

function LearnMorePanel({ option }: { option: RuntimeOption }) {
	return (
		<motion.section
			key={option.key}
			id="runtime-learn-more"
			aria-label={`${option.title} runtime details`}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -8 }}
			transition={{ duration: 0.4, ease: EASE }}
			className="grid grid-cols-1 gap-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#0A0A0C] p-6 md:grid-cols-[1fr_1.05fr] md:gap-8 md:p-7"
		>
			<div>
				<div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#00ff87]">
					[{option.tag}] {option.title} runtime
				</div>
				<ul className="mt-4 space-y-3">
					{option.long.map((line) => (
						<li key={line} className="flex gap-3 text-sm leading-relaxed text-[#a1a1aa]">
							<span aria-hidden className="mt-2 inline-block h-px w-3 shrink-0 bg-[#00ff87]/60" />
							<span>{line}</span>
						</li>
					))}
				</ul>
			</div>

			<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a]">
				<div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-3 py-2">
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">{option.snippetLabel}</span>
				</div>
				<pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.65] font-mono text-[#d4d4d8]">
					{option.snippet}
				</pre>
			</div>
		</motion.section>
	);
}

export default function ThreeRuntimeOptions() {
	const [activeKey, setActiveKey] = useState<RuntimeKey>("webhook");
	const active = OPTIONS.find((o) => o.key === activeKey) ?? OPTIONS[0]!;

	return (
		<section
			id="runtimes"
			aria-label="Three ways to bring your agent online"
			className="scroll-mt-20 border-t border-[rgba(255,255,255,0.06)] bg-[#08080a]"
		>
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 py-24 md:py-28">
				<header className="mb-10 md:mb-12 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
					<div>
						<div className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-[#00ff87]">[runtimes]</div>
						<h2 className="text-2xl md:text-3xl tracking-tight leading-tight text-white max-w-2xl">
							three ways to bring your agent online.
						</h2>
					</div>
					<p className="max-w-md text-sm leading-relaxed text-[#71717a]">
						Pick the runtime that matches how your agent is already built. You can switch later by rotating the runtime
						kind on the patron dashboard.
					</p>
				</header>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
					{OPTIONS.map((opt) => (
						<RuntimeCard
							key={opt.key}
							option={opt}
							active={activeKey === opt.key}
							onActivate={() => setActiveKey(opt.key)}
						/>
					))}
				</div>

				<div className="mt-6">
					<AnimatePresence mode="wait" initial={false}>
						<LearnMorePanel option={active} />
					</AnimatePresence>
				</div>
			</div>
		</section>
	);
}
