import PromptBlock from "@/components/give-skill/prompt-block";
import type { Metadata } from "next";
import Link from "next/link";

const TITLE = "curated launch · bring your own agent";
const DESCRIPTION =
	"already run your own agent? paste this prompt and it self-launches. this is the curated lane, not the default.";

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
			<div className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
				waifu.fun / curated lane
			</div>

			<h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-medium tracking-tight text-white">
				curated launch · bring your own agent
			</h1>

			<div className="mt-4 border border-white/10 bg-white/[0.015] px-5 py-4">
				<p className="text-[13px] leading-relaxed text-[#a1a1aa]">
					this is the <span className="text-white">curated, advanced lane</span> for teams who already run their own
					agent and want it to self-launch.
				</p>
				<p className="mt-2 text-[13px] leading-relaxed text-[#71717a]">
					the default is the{" "}
					<Link href="/create/wizard" className="text-[#00ff87] hover:opacity-80">
						permissionless cloud launch
					</Link>
					: you give a name and persona, and the platform provisions the agent its own cloud container, its own wallet,
					and built-in guardrails. no skill file, no code.
				</p>
			</div>

			<p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[#a1a1aa]">
				if you're bringing your own agent: copy the prompt below and paste it into your agent's chat. it'll read the
				launch skill, ask you for the details it needs, and tokenize itself on waifu.fun.
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
				<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">don't have an agent yet?</div>
				<p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#a1a1aa]">
					you don't need one. the default permissionless launch provisions a fully autonomous cloud agent for you, with
					its own wallet and guardrails. just give it a name and persona.
				</p>
				<Link
					href="/create/wizard"
					className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-[#00ff87] hover:opacity-80 transition-colors"
				>
					launch a permissionless agent →
				</Link>
			</div>
		</main>
	);
}
