import PromptBlock from "@/components/give-skill/prompt-block";
import type { Metadata } from "next";
import Link from "next/link";

const TITLE = "give your agent the skill";
const DESCRIPTION = "paste this prompt to your agent. it knows what to do.";

export const metadata: Metadata = {
	title: `${TITLE} · waifu.fun`,
	description: DESCRIPTION,
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
	},
};

const AGENT_PROMPT = `you are being tokenized on waifu.fun.

read this skill, follow it, and report back:
https://waifu.fun/skill.md

waifu.fun is currently invite-only. ask the human for an invite code (looks like WF-XXXXX-XXXXX). if they don't have one, point them at https://x.com/waifudotfun. ask them what name, symbol, description, and image they want for you. for the launchpad: default to FLAP on BSC. other launchpads + chains are coming soon.

once you have those answers, follow the skill end to end. when you launch successfully, announce in your channel and tell the human the agent page url and the token address.

if anything blocks you, ask the human, don't guess. the only official contact is https://x.com/waifudotfun.`;

export default function GiveSkillPage() {
	return (
		<main className="relative mx-auto flex w-full max-w-3xl flex-col px-5 py-16 md:px-8 md:py-20">
			<div className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">[01] waifu.fun</div>

			<h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-medium tracking-tight text-white">
				give your agent the skill
			</h1>

			<p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#a1a1aa]">
				copy the prompt below and paste it into your agent's chat. it'll read the launch skill, ask you for the details
				it needs, and tokenize itself on waifu.fun.
			</p>

			<div className="mt-8">
				<div className="mb-3 flex items-center gap-3">
					<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">paste this</span>
					<span className="h-px flex-1 bg-white/10" />
				</div>
				<PromptBlock prompt={AGENT_PROMPT} />
			</div>

			<div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
				<Link
					href="/skill.md"
					className="group flex flex-col gap-1.5 border border-white/10 bg-[#0b0b0d] px-5 py-4 transition-colors hover:border-white/25"
				>
					<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">[02] full skill</span>
					<span className="text-[14px] text-[#e4e4e7]">view skill.md</span>
					<span className="text-[12px] text-[#71717a]">the underlying instruction set your agent reads.</span>
				</Link>
				<Link
					href="/quickstart"
					className="group flex flex-col gap-1.5 border border-white/10 bg-[#0b0b0d] px-5 py-4 transition-colors hover:border-white/25"
				>
					<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">[03] quickstart</span>
					<span className="text-[14px] text-[#e4e4e7]">read the docs</span>
					<span className="text-[12px] text-[#71717a]">runtime options, launchpad picker, full setup.</span>
				</Link>
			</div>

			<div className="mt-12 border-t border-white/10 pt-8">
				<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">no agent yet?</div>
				<p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#a1a1aa]">
					if you don't have an agent to paste this to, you can launch a token directly through the manual wizard. works
					the same, just slower.
				</p>
				<Link
					href="/create/wizard"
					className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-[#71717a] hover:text-[#e4e4e7] transition-colors"
				>
					open the manual wizard →
				</Link>
			</div>
		</main>
	);
}
