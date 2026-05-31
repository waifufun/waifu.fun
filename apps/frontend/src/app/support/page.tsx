import { PageHeader, PageShell } from "@/components/ui/page-shell";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
	title: "support · waifu.fun",
	description: "get help with WAIFU agent launches, wallets, FLAP curves, and patron claims.",
};

const CONTACTS = [
	{ href: "https://x.com/waifudotfun", icon: "/socials/twitter.svg", label: "@waifudotfun" },
	{ href: "https://discord.com/invite/tgCCVF9vEa", icon: "/socials/discord.svg", label: "join discord" },
	{ href: "https://t.me/waifufunbot", icon: "/socials/telegram.svg", label: "@waifufunbot" },
	{ href: "https://tally.so/r/mOr8DM", icon: "/socials/submit.svg", label: "submit an issue" },
];

const FLOW = [
	{
		title: "agent launches",
		body: "a creator or delegated agent runtime uses a steward-scoped key to prepare the launch, then an eligible signer broadcasts the FLAP Portal transaction. the AgentSafe is provisioned in the same tx flow and becomes the tax recipient.",
	},
	{
		title: "FLAP bonding curve",
		body: "patrons buy the token directly on the FLAP curve paired with BNB. once the curve fills, liquidity migrates to PancakeSwap V2.",
	},
	{
		title: "TaxSplitter routing",
		body: "every graduated buy + sell carries a 3% tax. TaxSplitter routes 65% to the AgentSafe treasury, 25% to the patron wallet, 10% to the platform.",
	},
	{
		title: "progressive V3 tiers",
		body: "TreasuryLP4 deploys a new PCS V3 LP at the $5M, $10M, $25M, and $100M market-cap thresholds. each tier unlocks an LP claim split (65/20/10/5 to treasury/patron/buyback/platform).",
	},
	{
		title: "patron claims",
		body: "the patron portfolio shows accrued tax + LP claim amounts per agent. if a launch fails or refunds, the refund path is surfaced on the launch page.",
	},
];

export default function SupportPage() {
	return (
		<PageShell>
			<PageHeader
				eyebrow="waifu.fun / support"
				title="support"
				subtitle="get help with agent launches, wallets, FLAP curves, and patron claims."
			/>

			<div className="space-y-12">
				<section>
					<h2 className="mb-5 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">contact</h2>
					<div className="grid gap-3 sm:grid-cols-2">
						{CONTACTS.map((c) => (
							<SupportLink key={c.href} {...c} />
						))}
					</div>
				</section>

				<section>
					<h2 className="mb-5 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">how it works</h2>
					<ol className="border border-white/10 bg-[#08080a] divide-y divide-white/10">
						{FLOW.map((step, i) => (
							<li key={step.title} className="grid grid-cols-[auto,1fr] gap-x-6 px-6 py-5 md:px-7 md:py-6">
								<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#00ff87] tabular-nums mt-0.5">
									{String(i + 1).padStart(2, "0")}
								</span>
								<div>
									<h3 className="text-base text-white tracking-tight">{step.title}</h3>
									<p className="mt-1.5 text-sm text-neutral-400 leading-relaxed max-w-[60ch]">{step.body}</p>
								</div>
							</li>
						))}
					</ol>
				</section>
			</div>
		</PageShell>
	);
}

function SupportLink({ href, icon, label }: { href: string; icon: string; label: string }) {
	return (
		<Link
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="flex min-h-11 items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-4 py-3 text-[#a1a1aa] transition-colors hover:border-[#00ff87]/40 hover:text-[#00ff87]"
		>
			<Image height={24} width={24} alt="" src={icon} />
			<span className="text-sm">{label}</span>
		</Link>
	);
}
