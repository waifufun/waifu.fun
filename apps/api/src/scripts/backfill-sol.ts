import { agentApps, agentPersonas, agentWallets, getDatabase } from "@waifufun/db";
import { eq, or, sql } from "drizzle-orm";

const SOL_AGENT_UUID = "926f5fa8-aaa8-4ed2-9773-23833e467f4f";
// Sol's LIVE Hyperliquid venue wallet. The old 0x30641… address was abandoned
// (it never funded); the capability surface + Steward vault session both
// resolve to 0xfFFB1906…. We pin the live one here so hl_address /
// arb_addresses match what the patron UI capability panels actually show.
const SOL_HL_ADDRESS = "0xfFFB1906F3191c68B509Da1373eA684FB7d210AE";

// Sol's Steward agent-hot EOA (the Steward ACCOUNT wallet for agentId
// `sol-waifu`, tenant `elizacloud`). This is what `GET /v2/agents/:token`
// returns as `walletAddress` once an `agent_wallets` row exists. Without this
// row the patron UI shows an empty wallet + capability flows can't resolve the
// agent's on-chain identity. Source of truth: sol-steward-creds.json.
const SOL_STEWARD_EOA = "0xF8E13e517B3F1BAdCae9C570cb715A51A74A918F";
const SOL_STEWARD_TENANT_ID = "elizacloud";
const SOL_STEWARD_AGENT_ID = "sol-waifu";

// Patron link. Sol's human patron is Shadow (shadow@shad0w.xyz). Ownership is
// resolved by requireAgentOwnership() via EITHER
//   agent_personas.owner_steward_user_id === patron.stewardUserId   (preferred)
//   OR agent_personas.owner_address === patron.primaryAddress       (wallet fallback)
// We set BOTH when known. The wallet fallback (Shadow's primary EVM address)
// is sufficient for the patron UI to resolve the link today; the Steward user
// id can be supplied via SOL_PATRON_STEWARD_USER_ID when known so the preferred
// path also matches. Override either with env for safety/auditability.
const SOL_PATRON_ADDRESS = (
	process.env.SOL_PATRON_ADDRESS ?? "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC"
).toLowerCase();
const SOL_PATRON_STEWARD_USER_ID = process.env.SOL_PATRON_STEWARD_USER_ID ?? null;
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
			// Patron link — wire Shadow as Sol's patron so the patron UI resolves
			// ownership (requireAgentOwnership) and `?owner=`/`?mine=true` lists her.
			// COALESCE so we never clobber a real patron link if one already exists.
			ownerAddress: sql`COALESCE(${agentPersonas.ownerAddress}, ${SOL_PATRON_ADDRESS})`,
			...(SOL_PATRON_STEWARD_USER_ID
				? {
						ownerStewardUserId: sql`COALESCE(${agentPersonas.ownerStewardUserId}, ${SOL_PATRON_STEWARD_USER_ID})`,
					}
				: {}),
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

	// Backfill the agent wallet row so `GET /v2/agents/:token`.walletAddress
	// resolves to Sol's Steward agent-hot EOA. The detail/list queries LEFT JOIN
	// agent_wallets on internal_agent_id = agent_personas.agent_id; with no row
	// (or an empty wallet_address) the patron UI shows a blank wallet. We upsert
	// keyed on internal_agent_id (Sol's slug) and never clobber an existing
	// non-empty wallet_address.
	{
		const tokenForWallet = row.tokenAddress?.toLowerCase() ?? null;
		// Resolve any pre-existing row first. The orchestrator/indexer may have
		// created a token-keyed row (agent_token set, internal_agent_id still
		// null) before this backfill runs; `agent_token` is unique, so a blind
		// insert with the same token would violate `agent_wallet_token_unique`.
		// Look up by internal_agent_id FIRST (our preferred key), then fall back
		// to the token-keyed row so we ATTACH to it instead of inserting a dup.
		const [byInternalId] = await db
			.select({ id: agentWallets.id, walletAddress: agentWallets.walletAddress })
			.from(agentWallets)
			.where(eq(agentWallets.internalAgentId, row.agentId))
			.limit(1);
		const [byToken] =
			!byInternalId && tokenForWallet
				? await db
						.select({ id: agentWallets.id, walletAddress: agentWallets.walletAddress })
						.from(agentWallets)
						.where(sql`lower(${agentWallets.agentToken}) = ${tokenForWallet}`)
						.limit(1)
				: [undefined];
		const existingWallet = byInternalId ?? byToken;

		if (!existingWallet) {
			await db.insert(agentWallets).values({
				agentToken: tokenForWallet,
				walletAddress: SOL_STEWARD_EOA,
				stewardTenantId: SOL_STEWARD_TENANT_ID,
				stewardAgentId: SOL_STEWARD_AGENT_ID,
				internalAgentId: row.agentId,
			});
			console.log(`inserted agent_wallets row for ${row.agentId} -> ${SOL_STEWARD_EOA}`);
		} else {
			// Attach our keys (internal_agent_id, steward refs) to the existing row,
			// and only fill wallet_address when it's empty (never clobber a real one).
			const walletEmpty = !existingWallet.walletAddress || existingWallet.walletAddress.trim().length === 0;
			await db
				.update(agentWallets)
				.set({
					internalAgentId: row.agentId,
					stewardTenantId: SOL_STEWARD_TENANT_ID,
					stewardAgentId: SOL_STEWARD_AGENT_ID,
					...(walletEmpty ? { walletAddress: SOL_STEWARD_EOA } : {}),
					...(tokenForWallet ? { agentToken: tokenForWallet } : {}),
					updatedAt: new Date(),
				})
				.where(eq(agentWallets.id, existingWallet.id));
			console.log(
				walletEmpty
					? `attached + filled agent_wallets row ${existingWallet.id} for ${row.agentId} -> ${SOL_STEWARD_EOA}`
					: `attached keys to existing agent_wallets row ${existingWallet.id} for ${row.agentId} (wallet ${existingWallet.walletAddress} left as-is)`,
			);
		}
	}

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
