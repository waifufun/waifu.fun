"use client";

import { useTranslation } from "@/contexts/locale-context";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
	const { t } = useTranslation();
	const year = new Date().getFullYear();

	return (
		<footer className="w-full shrink-0 mt-auto py-10" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
			<div className="w-full px-4 sm:px-6 lg:px-8">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
					<div className="flex flex-col gap-1.5">
						<Link href="/" className="inline-flex max-w-full" aria-label={t("footer.homeAria")}>
							<Image
								src="/brand/lockup/lockup_waifufun_256.png"
								alt="waifu.fun"
								width={256}
								height={121}
								className="h-auto w-[164px] max-w-full object-contain"
								unoptimized
							/>
						</Link>
						<p className="text-sm font-mono text-[#52525b]">{t("footer.tagline")}</p>
						<p className="text-xs font-mono text-[#52525b] flex items-center gap-1.5 mt-1">
							<span className="inline-block w-1 h-1 rounded-full bg-[#00ff87] opacity-60" />
							{t("footer.poweredBy")}
						</p>
					</div>
				</div>

				<div
					className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4"
					style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}
				>
					<div className="flex flex-wrap items-center gap-4 text-xs">
						<Link href="/agents" className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200">
							agents
						</Link>
						<Link href="/quickstart" className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200">
							quickstart
						</Link>
						<Link href="/litepaper" className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200">
							litepaper
						</Link>
						<a
							href="https://docs.waifu.fun"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							{t("footer.docs")}
						</a>
						<a
							href="https://github.com/waifufun"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							github
						</a>
						<a
							href="https://x.com/waifudotfun"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							x
						</a>
					</div>
					<span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-[#71717a] px-2.5 py-1 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
						<span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#00ff87] opacity-70" />
						{t("footer.miladyCloud")}
					</span>
				</div>

				<div
					className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-5 text-xs"
					style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}
				>
					<p className="text-[#52525b] font-mono">&copy; {year} waifu.fun</p>
					<div className="flex flex-wrap items-center gap-4">
						<Link href="/privacy-policy" className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200">
							{t("footer.privacy")}
						</Link>
						<Link
							href="/terms-of-service"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							{t("footer.terms")}
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
