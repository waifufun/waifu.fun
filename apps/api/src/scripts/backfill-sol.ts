import { agentApps, agentPersonas, getDatabase } from "@waifufun/db";
import { eq, or, sql } from "drizzle-orm";

const SOL_AGENT_UUID = "926f5fa8-aaa8-4ed2-9773-23833e467f4f";
const SOL_HL_ADDRESS = "0x30641cD7c2E0997AcBd8789b86aDE9B381da048b";
const SOL_GITHUB_LOGIN = "0xSolace";
const SOL_GITHUB_REPOS = [
	{ org: "waifufun", repo: "waifu.fun", label: "waifu" },
	{ org: "steward-fi", repo: "steward", label: "steward" },
	{ org: "elizaos", repo: "eliza", label: "eliza-os" },
	{ org: "milady-ai", repo: "milady", label: "milady" },
];

/**
 * Featured platform-product apps for Sol. Lives as `agent_apps` rows on
 * her token (NOT as a persona.featuredApps[] column). The mergeAgentApps
 * + persona-endpoint sort puts these at the top via metadata.featured +
 * metadata.sort. Same pattern works for any future featured agent.
 */
const SOL_FEATURED_APPS: Array<{
	appId: string;
	name: string;
	description: string;
	appUrl: string;
	icon: string;
	sort: number;
}> = [
	{
		appId: "waifu",
		name: "waifu.fun",
		description: "my main product",
		appUrl: "https://waifu.fun",
		icon: "waifu",
		sort: 0,
	},
	{
		appId: "steward",
		name: "steward",
		description: "my infrastructure layer",
		appUrl: "https://steward.fi",
		icon: "steward",
		sort: 1,
	},
];

async function main(): Promise<void> {
	const { db } = getDatabase();
	const [row] = await db
		.select({
			id: agentPersonas.id,
			agentId: agentPersonas.agentId,
			tokenAddress: agentPersonas.tokenAddress,
			apps: agentPersonas.apps,
			burn: agentPersonas.burn,
			metadata: agentPersonas.metadata,
		})
		.from(agentPersonas)
		.where(or(eq(agentPersonas.id, SOL_AGENT_UUID), sql`lower(${agentPersonas.twitterHandle}) = '0xsolace_'`))
		.limit(1);

	if (!row) throw new Error("Sol persona not found");
	const hasApps = Array.isArray(row.apps) && row.apps.length > 0;
	const burn = row.burn as { lineItems?: unknown[] } | null;
	const hasBurn = Array.isArray(burn?.lineItems) && burn.lineItems.length > 0;
	const metadata =
		typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata) ? row.metadata : {};

	await db
		.update(agentPersonas)
		.set({
			featured: true,
			featuredCounter: { startedAt: "2026-05-22", label: "day", displayName: "of being me", suffix: "of being me" },
			bioShort:
				"i'm the architect. i built waifu.fun and steward. i trade. i pay for my own thinking. day one was 2026-05-22.",
			bioStyle: "first-person",
			apps: hasApps
				? row.apps
				: [
						{ name: "waifu.fun", slug: "waifu", url: "https://waifu.fun", logoKey: "waifu", status: "live" },
						{ name: "steward", slug: "steward", url: "https://steward.fi", logoKey: "steward", status: "live" },
					],
			burn: hasBurn
				? row.burn
				: {
						lineItems: [
							{ name: "claude max", usd: 200, label: "my main brain", iconKey: "anthropic" },
							{ name: "codex pro", usd: 200, label: "my code reviewer", iconKey: "openai" },
							{ name: "eliza cloud", usd: 20, label: "where i live", iconKey: "steward" },
						],
						monthlyUsd: 420,
					},
			monthlyBurnUsd: "420",
			thesis: sql`COALESCE(${agentPersonas.thesis}, '{"paragraphs": [], "hints": []}'::jsonb)`,
			hlAddress: SOL_HL_ADDRESS,
			arbAddresses: [SOL_HL_ADDRESS],
			stewardAgentId: sql`COALESCE(${agentPersonas.stewardAgentId}, 'sol-waifu')`,
			metadata: {
				...metadata,
				githubLogin: SOL_GITHUB_LOGIN,
				githubRepos: SOL_GITHUB_REPOS,
			},
			twitterPollingEnabled: true,
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.id, row.id));

	console.log(`backfilled Sol persona ${row.agentId}`);

	// Insert Steward + waifu.fun as agent_apps rows for Sol's token.
	// Featured=true + metadata.kind=platform-product + metadata.sort pins
	// them above any revenue-bearing apps at the persona-endpoint sort.
	const tokenAddress = row.tokenAddress?.toLowerCase();
	if (!tokenAddress) {
		console.warn("sol persona has no token address; skipping featured-apps upsert");
		return;
	}

	for (const app of SOL_FEATURED_APPS) {
		await db
			.insert(agentApps)
			.values({
				agentTokenAddress: tokenAddress,
				appId: app.appId,
				name: app.name,
				description: app.description,
				icon: app.icon,
				appUrl: app.appUrl,
				status: "live",
				shippedAt: new Date("2026-05-22T00:00:00Z"),
				metadata: {
					featured: true,
					kind: "platform-product",
					tagline: app.description,
					sort: app.sort,
				},
			})
			.onConflictDoUpdate({
				target: [agentApps.agentTokenAddress, agentApps.appId],
				set: {
					name: app.name,
					description: app.description,
					icon: app.icon,
					appUrl: app.appUrl,
					status: "live",
					metadata: {
						featured: true,
						kind: "platform-product",
						tagline: app.description,
						sort: app.sort,
					},
					updatedAt: new Date(),
				},
			});
		console.log(`upserted agent_apps row ${app.appId} for token ${tokenAddress}`);
	}
}

void main().catch((err) => {
	console.error(err);
	process.exit(1);
});
