"use client";

import { useTranslation } from "@/contexts/locale-context";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
	const { t } = useTranslation();
	const year = new Date().getFullYear();

	return (
		<footer
			className="w-full shrink-0 mt-auto py-10"
			style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
		>
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
						<a
							href="https://milady.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#c084fc] transition-colors duration-200"
						>
							milady.ai
						</a>
						<a
							href="https://elizaos.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							elizaos
						</a>
						<a
							href="https://elizaos.github.io/eliza/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							{t("footer.docs")}
						</a>
						<a
							href="https://github.com/milady-ai/milady"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							github
						</a>
						<a
							href="https://x.com/elizaos"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							x
						</a>
					</div>
					<span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[#52525b] px-2.5 py-1 rounded-sm border border-[rgba(192,132,252,0.15)] bg-[rgba(192,132,252,0.04)]">
						<span className="text-[#c084fc] opacity-60">●</span>
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
