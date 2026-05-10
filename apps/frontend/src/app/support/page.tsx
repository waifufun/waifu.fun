import { PageHeader, PageShell } from "@/components/ui/page-shell";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
	title: "support · waifu.fun",
	description: "get help with WAIFU agent launches, wallets, launch rounds, and patron claims.",
};

export default function SupportPage() {
	return (
		<PageShell>
			<PageHeader
				eyebrow="waifu.fun / support"
				title="support"
				subtitle="get help with agent launches, wallets, launch rounds, and patron claims."
			/>

			<div className="space-y-6">
				<section className="rounded-sm border border-white/10 bg-[#0C0C0C] p-6">
					<h2 className="mb-4 text-xl font-semibold text-[#00ff87]">contact</h2>
					<div className="grid gap-3 sm:grid-cols-2">
						<SupportLink href="https://x.com/waifudotfun" icon="/socials/twitter.svg" label="@waifudotfun" />
						<SupportLink
							href="https://discord.com/invite/tgCCVF9vEa"
							icon="/socials/discord.svg"
							label="join discord"
						/>
						<SupportLink href="https://t.me/waifufunbot" icon="/socials/telegram.svg" label="@waifufunbot" />
						<SupportLink href="https://tally.so/r/mOr8DM" icon="/socials/submit.svg" label="submit an issue" />
					</div>
				</section>

				<section className="rounded-sm border border-white/10 bg-[#0C0C0C] p-6">
					<h2 className="mb-6 text-xl font-semibold text-[#00ff87]">how v3 works</h2>
					<div className="space-y-6 text-sm leading-relaxed text-[#a1a1aa]">
						<InfoBlock title="agent launches">
							a creator starts a 24h launch round. patrons deposit BNB, the vault enforces the tier cap, and the round
							either launches or refunds.
						</InfoBlock>
						<InfoBlock title="burn edition tiers">
							each agent token starts with 1B supply. v3 burns at least 50% up front, reserves 20% for presale claims,
							routes 20% through launch liquidity, and parks 10% in the agent treasury reserve.
						</InfoBlock>
						<InfoBlock title="WAIFU and FLAP">
							WAIFU uses the FLAP Portal path for bundled launch execution where configured. the user surface focuses on
							circulating market cap, claimable balances, and clear pending, confirmed, or failed transaction states.
						</InfoBlock>
						<InfoBlock title="patron claims">
							when a launch succeeds, patrons claim from their portfolio. if a launch fails or does not clear, the
							refund path is surfaced on the launch page as backend and contract support becomes available.
						</InfoBlock>
					</div>
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
			<span>{label}</span>
		</Link>
	);
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
			<h3 className="mb-2 text-base font-semibold text-[#e4e4e7]">{title}</h3>
			<p>{children}</p>
		</div>
	);
}
