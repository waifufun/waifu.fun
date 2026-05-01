"use client";

import { EASE_HERO } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useId, useState } from "react";
import { CheckIcon, CloudIcon, CopyIcon, PullIcon, WebhookIcon } from "./wizard-icons";
import { type RuntimeKind, useWizard } from "./wizard-state";

type Option = {
	kind: RuntimeKind;
	title: string;
	tagline: string;
	description: string;
	Icon: typeof CloudIcon;
	badge?: string;
};

const OPTIONS: Option[] = [
	{
		kind: "hosted",
		title: "[01] hosted",
		tagline: "we run it for you. pay as you go.",
		description:
			"pre-baked eliza runtime on milady cloud. plugins for trade, X, treasury wired in. inference billed from the agent's treasury.",
		Icon: CloudIcon,
		badge: "[recommended]",
	},
	{
		kind: "webhook",
		title: "[02] webhook",
		tagline: "your agent on a public URL.",
		description: "we POST events to your URL with HMAC auth. your agent acts via steward keys. framework-agnostic.",
		Icon: WebhookIcon,
	},
	{
		kind: "pull",
		title: "[03] pull",
		tagline: "you poll us. works behind firewalls.",
		description: "for residential or hobbyist setups behind NAT. get an API key once, fetch events on your schedule.",
		Icon: PullIcon,
	},
];

const TRANSITION = { duration: 0.28, ease: EASE_HERO };

export default function StepRuntime() {
	const { state, patchRuntime } = useWizard();

	return (
		<div className="flex flex-col gap-6">
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				{OPTIONS.map((opt) => (
					<RuntimeCard
						key={opt.kind}
						opt={opt}
						selected={state.runtime.kind === opt.kind}
						onSelect={() => patchRuntime({ kind: opt.kind })}
					/>
				))}
			</div>

			<AnimatePresence mode="wait" initial={false}>
				{state.runtime.kind === "webhook" ? (
					<motion.div
						key="webhook"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={TRANSITION}
					>
						<WebhookConfig />
					</motion.div>
				) : null}
				{state.runtime.kind === "pull" ? (
					<motion.div
						key="pull"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={TRANSITION}
					>
						<PullConfig />
					</motion.div>
				) : null}
				{state.runtime.kind === "hosted" ? (
					<motion.div
						key="hosted"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={TRANSITION}
					>
						<HostedConfirm />
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

function RuntimeCard({ opt, selected, onSelect }: { opt: Option; selected: boolean; onSelect: () => void }) {
	const { Icon } = opt;
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"group relative text-left p-5 border h-full flex flex-col gap-3",
				"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
				selected
					? "border-accent/60 bg-accent/[0.04]"
					: "border-white/8 bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.03]",
			)}
		>
			<div className="flex items-center justify-between">
				<span
					className={cn(
						"inline-flex h-9 w-9 items-center justify-center border",
						selected ? "border-accent/50 text-accent" : "border-white/10 text-neutral-300",
					)}
					aria-hidden
				>
					<Icon className="h-4 w-4" />
				</span>
				{opt.badge ? (
					<span className="text-[9px] font-mono uppercase tracking-[0.2em] text-accent border border-accent/30 px-1.5 py-0.5">
						{opt.badge}
					</span>
				) : null}
				{selected && !opt.badge ? <CheckIcon className="h-4 w-4 text-accent" /> : null}
				{selected && opt.badge ? null : null}
			</div>

			<div>
				<h3 className="text-base text-white tracking-tight font-mono">{opt.title}</h3>
				<p className="text-[11px] tracking-tight text-neutral-500 mt-1 leading-relaxed">{opt.tagline}</p>
			</div>

			<p className="text-xs text-neutral-400 leading-relaxed">{opt.description}</p>

			{selected ? <span className="absolute -top-px -right-px h-2 w-2 bg-accent" aria-hidden /> : null}
		</button>
	);
}

function HostedConfirm() {
	return (
		<aside className="border border-white/5 bg-white/[0.012] p-5">
			<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">hosted runtime</p>
			<p className="mt-2 text-sm text-neutral-300 leading-relaxed">
				default. we provision a milady cloud container at the next step. inference burns from the agent's treasury. you
				can move to a self-hosted runtime later from /patron.
			</p>
		</aside>
	);
}

function WebhookConfig() {
	const { state, patchRuntime } = useWizard();
	const [copied, setCopied] = useState(false);
	const urlId = useId();
	const secretId = useId();

	const copy = useCallback(async () => {
		if (!state.runtime.webhookSecret) return;
		try {
			await navigator.clipboard.writeText(state.runtime.webhookSecret);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			// ignore
		}
	}, [state.runtime.webhookSecret]);

	const url = state.runtime.webhookUrl.trim();
	let urlInvalid = false;
	if (url.length > 0) {
		try {
			new URL(url);
		} catch {
			urlInvalid = true;
		}
	}

	return (
		<aside className="border border-white/5 bg-white/[0.012] p-5 flex flex-col gap-4">
			<div>
				<label htmlFor={urlId} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
					webhook url
				</label>
				<div
					className={cn(
						"mt-2 flex items-center bg-black/40 border h-11 px-3",
						"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
						urlInvalid
							? "border-red-500/40 focus-within:border-red-500/70"
							: "border-white/10 focus-within:border-white/30",
					)}
				>
					<span className="text-neutral-600 font-mono text-xs mr-2">POST</span>
					<input
						id={urlId}
						type="url"
						spellCheck={false}
						placeholder="https://your-agent.example.com/waifu/events"
						value={state.runtime.webhookUrl}
						onChange={(e) => patchRuntime({ webhookUrl: e.target.value })}
						className="flex-1 bg-transparent outline-none text-sm font-mono text-white placeholder:text-neutral-600"
					/>
				</div>
				<p className="mt-1.5 text-[11px] text-neutral-500 leading-relaxed">
					your endpoint should accept JSON, verify the HMAC signature, and return 2xx fast.
				</p>
			</div>

			<div>
				<div className="flex items-baseline justify-between">
					<label htmlFor={secretId} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						hmac secret
					</label>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">auto-generated</span>
				</div>
				<div className="mt-2 flex items-center bg-black/40 border border-white/10 h-11 pl-3 pr-1">
					<input
						id={secretId}
						type="text"
						readOnly
						value={state.runtime.webhookSecret}
						aria-label="HMAC secret"
						className="flex-1 bg-transparent outline-none text-xs font-mono text-neutral-300 select-all"
					/>
					<button
						type="button"
						onClick={copy}
						aria-label="copy secret"
						className={cn(
							"inline-flex items-center gap-1.5 h-9 px-3 text-[11px] font-mono uppercase tracking-[0.2em]",
							"border border-white/10 text-neutral-300 transition-colors duration-200",
							"hover:border-white/30 hover:text-white",
						)}
					>
						{copied ? (
							<>
								<CheckIcon className="h-3 w-3 text-accent" />
								<span>copied</span>
							</>
						) : (
							<>
								<CopyIcon className="h-3 w-3" />
								<span>copy</span>
							</>
						)}
					</button>
				</div>
				<p className="mt-1.5 text-[11px] text-neutral-500 leading-relaxed">
					used to sign each request as <span className="font-mono">x-waifu-signature</span>. rotate later from /patron.
				</p>
			</div>
		</aside>
	);
}

function PullConfig() {
	return (
		<aside className="border border-white/5 bg-white/[0.012] p-5">
			<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">pull mode</p>
			<p className="mt-2 text-sm text-neutral-300 leading-relaxed">
				after provisioning we'll show your API key once. use it to long-poll{" "}
				<span className="font-mono text-neutral-200">GET /v2/agents/:id/events</span> from anywhere. no public URL
				required.
			</p>
			<Link
				href="/litepaper"
				className="mt-3 inline-flex items-center gap-1.5 text-xs text-accent hover:underline underline-offset-4"
			>
				read the polling guide
				<span aria-hidden>{"\u2192"}</span>
			</Link>
		</aside>
	);
}
