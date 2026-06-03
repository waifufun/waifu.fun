import type { MetadataRoute } from "next";

import {
	fetchAgentAddressesForStaticExport,
	fetchAgentTokenRouteParamsForStaticExport,
	fetchTokenRouteParamsForStaticExport,
} from "@/lib/static-export-paths";

// This is an async sitemap (it enumerates pages at build time), so under
// `output: export` it must be forced to static generation.
export const dynamic = "force-static";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://waifu.fun";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Public top-level routes worth indexing (excludes /admin and auth-only flows).
const STATIC_ROUTES = [
	"",
	"/agents",
	"/launches",
	"/leaderboard",
	"/create",
	"/litepaper",
	"/fees",
	"/apps",
	"/story",
	"/quickstart",
	"/support",
	"/terms-of-service",
	"/privacy-policy",
];

/**
 * Emits a static `sitemap.xml` (compatible with `output: "export"`). Lists the
 * public top-level routes plus the agent/token detail pages — the launchpad's
 * actual product — reusing the same build-time enumerators as the route
 * `generateStaticParams`. Dynamic enumeration is best-effort: if the API is
 * unreachable at build time the static routes still ship.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const now = new Date();

	const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
		url: `${SITE_URL}${path}`,
		lastModified: now,
		changeFrequency: path === "" ? "hourly" : "daily",
		priority: path === "" ? 1 : 0.7,
	}));

	try {
		const [agents, agentTokens, tokens] = await Promise.all([
			fetchAgentAddressesForStaticExport(),
			fetchAgentTokenRouteParamsForStaticExport(),
			fetchTokenRouteParamsForStaticExport(),
		]);

		for (const { address } of agents) {
			if (address.toLowerCase() === ZERO_ADDRESS) continue;
			entries.push({
				url: `${SITE_URL}/agent/${address}`,
				lastModified: now,
				changeFrequency: "hourly",
				priority: 0.8,
			});
		}

		for (const { chain, chainId, contractAddress } of [...agentTokens, ...tokens]) {
			if (contractAddress.toLowerCase() === ZERO_ADDRESS) continue;
			entries.push({
				url: `${SITE_URL}/token/${chain}/${chainId}/${contractAddress}`,
				lastModified: now,
				changeFrequency: "daily",
				priority: 0.6,
			});
		}
	} catch {
		// best-effort: the static routes above still ship
	}

	// De-dupe by url (an agent token can appear in more than one enumerator).
	const seen = new Set<string>();
	return entries.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
}
