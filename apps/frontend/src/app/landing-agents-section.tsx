"use client";

/**
 * Landing-page "live agents" section header. Client component so it can
 * consume t() while the parent stays a server component.
 */
import { useTranslation } from "@/contexts/locale-context";
import type { ReactNode } from "react";

export default function LandingAgentsSection({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	return (
		<section id="explore" className="relative z-20 w-full max-w-6xl mx-auto px-5 md:px-8 pt-12 pb-20 scroll-mt-20">
			<div className="mb-8 flex items-end justify-between">
				<div>
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-2">
						{t("discover.landing.agentsEyebrow")}
					</div>
					<h2 className="text-2xl md:text-3xl leading-tight tracking-tight text-white">
						{t("discover.landing.liveAgents")}
					</h2>
				</div>
				<a
					href="/agents"
					className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors duration-150"
				>
					{t("discover.landing.browseAll")}
				</a>
			</div>

			{children}
		</section>
	);
}
