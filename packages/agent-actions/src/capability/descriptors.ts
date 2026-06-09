/**
 * Hand-authored capability descriptors.
 *
 * These are descriptor BUILDERS, not values: each takes the resolved agent
 * identity (internal id + token address) so it can emit correct, fully-qualified
 * data/action endpoints and per-agent status. The API registry calls these and
 * also synthesizes adapter-backed descriptors (PancakeV3/Venus) from specs.
 *
 * Three descriptors here:
 *
 *  1. `hyperliquid-perps` — the REFERENCE capability. It wraps the existing
 *     bespoke HL routes (positions / pnl / tax-income / patron deposit) into the
 *     capability shape WITHOUT ripping them out. Old routes stay the execution
 *     backend; this descriptor just makes them discoverable + render-able.
 *
 *  2. `polymarket` — PLANNED stub. Prediction-market trading. Descriptor only,
 *     status locked, no execution endpoints. Proves a new venue = add a
 *     descriptor (+ later an adapter), nothing else.
 *
 *  3. `tax-arb-vault` — PLANNED stub. Perp-tax-funded arb vault: a composite
 *     capability that would consume the agent's tax stream and a trading venue.
 *     Descriptor only, status locked.
 */

import type {
	CapabilityActionDescriptor,
	CapabilityDataProvider,
	CapabilityDescriptor,
	CapabilityStatus,
} from "./types.js";

/** Resolved agent identity the descriptor builders render against. */
export interface AgentDescriptorContext {
	/** Internal stable persona id (agent_personas.agent_id). Used in endpoint paths. */
	id: string;
	/** Token address if launched, else null. */
	tokenAddress: string | null;
	/** Resolved Hyperliquid wallet address, if the agent has one in the registry. */
	hyperliquidWallet?: string | null;
	/** Steward agent id, if bound. Gates agent-signed venue actions. */
	stewardAgentId?: string | null;
}

/**
 * `hyperliquid-perps` — reference capability wrapping the existing HL surface.
 *
 * Endpoints intentionally point at the LIVE bespoke routes so the abstraction
 * describes reality with zero behavior change:
 *   - GET /v2/agents/:id/hyperliquid/positions
 *   - GET /v2/agents/:id/hyperliquid/pnl
 *   - GET /v2/agents/:id/tax-income
 *   - POST /v2/agents/:id/trading/deposit-quote  (patron-signed funding)
 */
export function hyperliquidPerpsDescriptor(ctx: AgentDescriptorContext): CapabilityDescriptor {
	const base = `/v2/agents/${ctx.id}`;
	const hasWallet = Boolean(ctx.hyperliquidWallet);

	const data: CapabilityDataProvider[] = [
		{
			view: "summary",
			label: "Account",
			render: "metric-grid",
			endpoint: `${base}/hyperliquid/positions`,
		},
		{
			view: "positions",
			label: "Open positions",
			render: "positions-table",
			endpoint: `${base}/hyperliquid/positions`,
		},
		{
			view: "pnl",
			label: "Trading PnL",
			render: "line-chart",
			endpoint: `${base}/hyperliquid/pnl`,
		},
		{
			view: "income",
			label: "Tax income",
			render: "income-card",
			endpoint: `${base}/tax-income`,
		},
	];

	const actions: CapabilityActionDescriptor[] = [
		{
			// patron funds their OWN HL account via Li.Fi quote — client-signed.
			// Inputs MUST mirror POST /trading/deposit-quote, which requires
			// fromChain, fromToken, amount, AND fromAddress (else MISSING_PARAMS).
			slug: "deposit",
			label: "Fund trading",
			description: "Bridge + deposit funds into the Hyperliquid account (patron-signed).",
			mode: "client_signed",
			requiresConsent: true,
			inputs: [
				{ name: "fromChain", label: "From chain", type: "chain-select", required: true },
				{ name: "fromToken", label: "From token", type: "token-select", required: true },
				{ name: "amount", label: "Amount", type: "amount", required: true },
				{
					name: "fromAddress",
					label: "Funding wallet",
					type: "address",
					required: true,
					help: "Must match the authenticated patron or agent owner wallet.",
				},
			],
			endpoint: `${base}/trading/deposit-quote`,
			method: "POST",
			cost: { gasEstimate: "0" },
		},
		{
			// trading policy update — PUT /trading-policy. Field names + verb mirror
			// the live route's sanitizeCaps (dailyCap/perOrderCap/leverageCap/...).
			slug: "set-policy",
			label: "Update trading policy",
			description: "Update leverage, per-order/daily caps, and allowed assets/venues.",
			mode: "server_job",
			requiresConsent: true,
			inputs: [
				{ name: "leverageCap", label: "Leverage cap", type: "number", required: false },
				{ name: "perOrderCap", label: "Per-order cap (USD)", type: "amount", required: false },
				{ name: "dailyCap", label: "Daily cap (USD)", type: "amount", required: false },
				{ name: "allowedAssets", label: "Allowed assets", type: "text", required: false },
				{ name: "allowedVenues", label: "Allowed venues", type: "text", required: false },
			],
			endpoint: `${base}/trading-policy`,
			method: "PUT",
			cost: { gasEstimate: "0" },
		},
	];

	const status: CapabilityStatus = hasWallet ? "enabled" : "available";

	return {
		slug: "hyperliquid-perps",
		name: "Hyperliquid Perps",
		summary: "Perp positions, PnL, funding, and tax-income — wrapping the live HL surface.",
		category: "trading",
		maturity: "live",
		status,
		tags: ["venue:hyperliquid", "perps", "trading", "reference"],
		// Hyperliquid runs on its own L1; the bridge/funding side is Arbitrum (42161).
		chains: [42161],
		wallets: [
			{
				role: "venue-bridge",
				chain: "arb",
				venue: "hyperliquid",
				address: ctx.hyperliquidWallet ?? null,
				required: true,
			},
		],
		requirements: [
			{
				kind: "wallet",
				id: "hyperliquid-wallet",
				label: "Hyperliquid venue wallet",
				required: true,
				satisfied: hasWallet,
				// only attach a hint when the requirement is unmet (keeps descriptors free of undefined-valued keys).
				...(hasWallet ? {} : { hint: "Register a Hyperliquid wallet in agent_wallet_registry (venue=hyperliquid)." }),
			},
			{
				kind: "venue-key",
				id: "steward:hyperliquid",
				label: "Steward Hyperliquid signer",
				required: false,
				satisfied: Boolean(ctx.stewardAgentId),
				hint: "Needed only for autonomous agent-signed trading; patron-signed funding works without it.",
			},
		],
		data,
		actions,
		adapterSlug: null,
	};
}

/** `polymarket` — PLANNED stub. Prediction-market trading, descriptor-only. */
export function polymarketDescriptor(ctx: AgentDescriptorContext): CapabilityDescriptor {
	return {
		slug: "polymarket",
		name: "Polymarket",
		summary: "Prediction-market trading (positions, orders, market exposure). Planned.",
		category: "trading",
		maturity: "planned",
		status: "locked",
		tags: ["venue:polymarket", "prediction-market", "planned"],
		chains: [137], // Polygon
		wallets: [
			{ role: "venue-bridge", chain: "polygon", venue: "polymarket", address: null, required: true },
			{ role: "patron", chain: "polygon", venue: "polymarket", address: null, required: false },
		],
		requirements: [
			{
				kind: "wallet",
				id: "polymarket-wallet",
				label: "Polymarket USDC wallet",
				required: true,
				satisfied: false,
				hint: "Polymarket capability is not yet implemented.",
			},
		],
		// no read providers yet — execution + data are deferred.
		data: [],
		actions: [
			{
				slug: "place-order",
				label: "Place order",
				description: "Place a CLOB order on a Polymarket binary market.",
				mode: "agent_signed",
				requiresConsent: true,
				inputs: [],
				endpoint: null,
				cost: { gasEstimate: "0" },
			},
		],
		adapterSlug: null,
	};
}

/** `tax-arb-vault` — PLANNED stub. Composite tax-funded arb vault, descriptor-only. */
export function taxArbVaultDescriptor(ctx: AgentDescriptorContext): CapabilityDescriptor {
	return {
		slug: "tax-arb-vault",
		name: "Tax Arb Vault",
		summary: "Deploys the agent's tax-stream income into a delta-neutral arb strategy. Planned.",
		category: "vault",
		maturity: "planned",
		status: "locked",
		tags: ["vault", "composite", "tax-funded", "planned"],
		chains: [56],
		wallets: [{ role: "agent-safe", chain: "bsc", address: null, required: true }],
		requirements: [
			{
				kind: "policy",
				id: "tax-stream",
				label: "Active tax-income stream",
				required: true,
				satisfied: false,
				hint: "Composite vault consuming tax income + a trading venue. Not yet implemented.",
			},
			{
				kind: "consent",
				id: "vault-autonomy",
				label: "Patron-approved vault autonomy",
				required: true,
				satisfied: false,
			},
		],
		data: [],
		actions: [
			{
				slug: "harvest-tax",
				label: "Harvest tax income",
				description: "Sweep accrued tax income into the vault's deployable balance.",
				mode: "server_job",
				requiresConsent: true,
				inputs: [],
				endpoint: null,
				cost: { gasEstimate: "0" },
			},
		],
		adapterSlug: null,
	};
}
