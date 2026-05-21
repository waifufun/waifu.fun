/**
 * `/agent/sol` vanity slug.
 *
 * Sprint 2 decision (Shadow confirmed): until $WAIFU mints, the architect
 * agent's canonical page is the ElizaOS placeholder token on BSC. This
 * route renders a tiny page that redirects to the real
 * `/agent/[address]` surface so links shared as `waifu.fun/agent/sol`
 * resolve correctly under static export (`output: "export"`).
 *
 * `next/navigation`'s `redirect()` is unavailable under static export, so
 * we ship three layers of redirect:
 *   1. A `<meta http-equiv="refresh">` tag (works without JS, React 19
 *      auto-hoists it into <head>).
 *   2. An inline script that fires before hydration.
 *   3. The client component's useEffect on mount as the final fallback.
 *
 * When $WAIFU launches, swap `SOL_AGENT_ADDRESS` in
 * `apps/frontend/src/lib/wave-t/sol-agent.ts` for the real token address
 * and this route updates automatically.
 */
import type { Metadata } from "next";

import { SOL_AGENT_ADDRESS } from "@/lib/wave-t/sol-agent";

import { SolAgentRedirectClient } from "./redirect-client";

const TARGET_PATH = `/agent/${SOL_AGENT_ADDRESS}`;

export const dynamic = "force-static";

export const metadata: Metadata = {
	title: "sol · waifu.fun",
	description: "Redirecting to the architect agent page.",
	robots: { index: false, follow: false },
	alternates: { canonical: TARGET_PATH },
};

export default function SolAgentRedirect() {
	const inlineScript = `try{window.location.replace(${JSON.stringify(TARGET_PATH)})}catch(e){}`;
	return (
		<main
			className="min-h-[100dvh] bg-[#08080a] text-white/50"
			style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
		>
			<meta httpEquiv="refresh" content={`0; url=${TARGET_PATH}`} />
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: tiny static redirect shim */}
			<script dangerouslySetInnerHTML={{ __html: inlineScript }} />
			<SolAgentRedirectClient target={TARGET_PATH} />
			<p className="font-mono text-xs">
				redirecting to{" "}
				<a className="text-[#00ff87] hover:underline" href={TARGET_PATH}>
					{TARGET_PATH}
				</a>
				.
			</p>
		</main>
	);
}
