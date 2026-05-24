"use client";

import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { useTranslation } from "@/contexts/locale-context";
import Image from "next/image";
import Link from "next/link";

// NOTE: metadata moved to layout.tsx (server) since this page is now a client
// component (i18n via useTranslation requires "use client"). If product wants
// the support page to retain its document title for SEO, wire it via a parallel
// app/support/layout.tsx export const metadata.

const CONTACT_LINKS = [
	{ href: "https://x.com/waifudotfun", icon: "/socials/twitter.svg", labelKey: "support.contactTwitter" },
	{ href: "https://discord.com/invite/tgCCVF9vEa", icon: "/socials/discord.svg", labelKey: "support.contactDiscord" },
	{ href: "https://t.me/waifufunbot", icon: "/socials/telegram.svg", labelKey: "support.contactTelegram" },
	{ href: "https://tally.so/r/mOr8DM", icon: "/socials/submit.svg", labelKey: "support.contactSubmit" },
] as const;

const FLOW_KEYS = [
	{ titleKey: "support.step1Title", bodyKey: "support.step1Body" },
	{ titleKey: "support.step2Title", bodyKey: "support.step2Body" },
	{ titleKey: "support.step3Title", bodyKey: "support.step3Body" },
	{ titleKey: "support.step4Title", bodyKey: "support.step4Body" },
	{ titleKey: "support.step5Title", bodyKey: "support.step5Body" },
] as const;

export default function SupportPage() {
	const { t } = useTranslation();
	return (
		<PageShell>
			<PageHeader eyebrow={t("support.eyebrow")} title={t("support.title")} subtitle={t("support.subtitle")} />

			<div className="space-y-12">
				<section>
					<h2 className="mb-5 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
						{t("support.contactHeader")}
					</h2>
					<div className="grid gap-3 sm:grid-cols-2">
						{CONTACT_LINKS.map((c) => (
							<SupportLink key={c.href} href={c.href} icon={c.icon} label={t(c.labelKey)} />
						))}
					</div>
				</section>

				<section>
					<h2 className="mb-5 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
						{t("support.howItWorksHeader")}
					</h2>
					<ol className="border border-white/10 bg-[#08080a] divide-y divide-white/10">
						{FLOW_KEYS.map((step, i) => (
							<li key={step.titleKey} className="grid grid-cols-[auto,1fr] gap-x-6 px-6 py-5 md:px-7 md:py-6">
								<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#00ff87] tabular-nums mt-0.5">
									{String(i + 1).padStart(2, "0")}
								</span>
								<div>
									<h3 className="text-base text-white tracking-tight">{t(step.titleKey)}</h3>
									<p className="mt-1.5 text-sm text-neutral-400 leading-relaxed max-w-[60ch]">{t(step.bodyKey)}</p>
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
