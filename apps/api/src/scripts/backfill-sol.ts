import { agentPersonas, getDatabase } from "@waifufun/db";
import { eq, or, sql } from "drizzle-orm";

const SOL_AGENT_UUID = "926f5fa8-aaa8-4ed2-9773-23833e467f4f";
const SOL_HL_ADDRESS = "0x30641cD7c2E0997AcBd8789b86aDE9B381da048b";

async function main(): Promise<void> {
	const { db } = getDatabase();
	const [row] = await db
		.select({
			id: agentPersonas.id,
			agentId: agentPersonas.agentId,
			apps: agentPersonas.apps,
			burn: agentPersonas.burn,
		})
		.from(agentPersonas)
		.where(or(eq(agentPersonas.id, SOL_AGENT_UUID), eq(agentPersonas.twitterHandle, "0xsolace_")))
		.limit(1);

	if (!row) throw new Error("Sol persona not found");
	const hasApps = Array.isArray(row.apps) && row.apps.length > 0;
	const burn = row.burn as { lineItems?: unknown[] } | null;
	const hasBurn = Array.isArray(burn?.lineItems) && burn.lineItems.length > 0;

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
						{ name: "steward", slug: "steward", url: "https://eliza.steward.fi", logoKey: "steward", status: "live" },
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
			twitterPollingEnabled: true,
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.id, row.id));

	console.log(`backfilled Sol persona ${row.agentId}`);
}

void main().catch((err) => {
	console.error(err);
	process.exit(1);
});
