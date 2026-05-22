/**
 * IdentityPanel. The agent's traits + socials + brain reveal, surfaced
 * as its own SurfaceCard so the wave-M page closes with a 'who is this'
 * note rather than trailing off into raw stats.
 *
 * Shows:
 *   - trait chips (when present)
 *   - twitter handle (when present)
 *   - system prompt reveal (when present), via SystemPromptReveal
 *
 * Description is intentionally NOT repeated here: the hero already
 * surfaces it as the tagline directly under the name. Showing it twice
 * (hero + identity) read as a copy-paste accident in the playwright
 * audit pass.
 *
 * Deliberately omits the v1 'AGENT / 8004' framework + model chips:
 * those exposed runtime-implementation detail that didn't matter to a
 * buyer choosing a tier, and Shadow's brief flagged them as leakage.
 */
import { ExternalLink } from "lucide-react";

import { SurfaceCard } from "@/components/ui/surface-card";

import SystemPromptReveal from "./system-prompt-reveal";
import type { AgentData } from "./types";

export interface IdentityPanelProps {
	agent: AgentData;
}

export default function IdentityPanel({ agent }: IdentityPanelProps) {
	const hasTraits = !!agent.traits && agent.traits.length > 0;
	const hasTwitter = !!agent.twitterHandle;
	const hasPrompt = !!agent.systemPrompt;

	if (!hasTraits && !hasTwitter && !hasPrompt) {
		return null;
	}

	return (
		<SurfaceCard padding="lg" className="flex flex-col gap-5">
			{hasTraits || hasTwitter ? (
				<div className="flex flex-wrap items-center gap-2">
					{agent.traits?.map((t) => (
						<span
							key={t}
							className="inline-flex h-6 items-center rounded-sm border border-white/10 bg-white/[0.02] px-2 font-mono text-[10px] tracking-wide text-white/55"
						>
							{t}
						</span>
					))}
					{hasTwitter ? (
						<a
							href={`https://x.com/${agent.twitterHandle}`}
							target="_blank"
							rel="noopener noreferrer"
							className="ml-auto inline-flex h-6 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55 transition-colors duration-200 hover:text-white/85"
						>
							@{agent.twitterHandle}
							<ExternalLink className="h-3 w-3" strokeWidth={1.5} />
						</a>
					) : null}
				</div>
			) : null}

			{hasPrompt ? (
				<div className={hasTraits || hasTwitter ? "border-t border-white/[0.06] pt-5" : ""}>
					<div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">brain</div>
					<SystemPromptReveal systemPrompt={agent.systemPrompt as string} />
				</div>
			) : null}
		</SurfaceCard>
	);
}
