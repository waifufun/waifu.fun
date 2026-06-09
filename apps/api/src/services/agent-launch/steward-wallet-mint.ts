/**
 * Steward agent-wallet mint for provision-on-launch.
 *
 * GOAL: every provisioned agent is born WITH its own Eliza Cloud Steward
 * wallet (its agent-hot EOA). This module is the integration point that
 * actually MINTS that wallet during provisioning, closing the seam #1005
 * documented (where `agent_wallets.wallet_address` was left as a zero-address
 * sentinel and provisioning was gated on `agent-hot.status='pending-steward-eoa'`).
 *
 * ── The REAL Steward mint mechanism ──────────────────────────────────────
 * This is NOT a stub. The same Steward call that minted sol-the-architect's
 * agent wallet is reused here: `POST {STEWARD_API_URL}/agents` with body
 * `{ id, name, platformId }`, authenticated with the tenant API key
 * (`X-Steward-Key: STEWARD_API_KEY`) + `X-Steward-Tenant: STEWARD_TENANT_ID`.
 * Steward custodies the private key and returns the agent EOA address
 * (`walletAddress`). This is exactly what {@link StewardClient.createWallet}
 * / {@link StewardClient.ensureAgent} already wrap — verified live for Sol
 * (see TOOLS.md + agent-launch/orchestrator.ts step 1 "steward.provision").
 *
 * Idempotency: we key on the deterministic launch `agentId`
 * (`waifu-${symbol}-${token.slice(2,10)}`) and use `ensureAgent` (find-or-create,
 * swallows 409/"already exists"). A re-run / retry reuses the SAME Steward
 * agent + EOA instead of minting a duplicate. The minted EOA is the
 * constrained burner the AgentSafe + Zodiac role layer (#1013) assigns as
 * `agentEoa` via the factory's `createLaunch`.
 */

import { type StewardClient, StewardError, createStewardClient } from "./steward.js";

/** A minted (or reused) Steward agent wallet. */
export interface MintedStewardWallet {
	/** Steward agentId the wallet is filed under (stable across rotations). */
	stewardAgentId: string;
	/** Steward tenant the agent lives under (e.g. "waifu"). */
	tenantId: string;
	/** The agent's EOA address — its agent-hot wallet, the constrained burner. */
	walletAddress: string;
	/** Optional Solana address if Steward also provisioned one. */
	solanaAddress?: string | null;
	/** true when this call CREATED the wallet, false when it reused an existing one. */
	created: boolean;
}

/**
 * The minimal surface provision-on-launch needs from Steward to MINT/REUSE an
 * agent's agent-hot EOA. The default implementation talks to the real Steward
 * `/agents` endpoint; tests inject a mock so no network is touched.
 */
export interface StewardWalletClient {
	/**
	 * Find-or-create the agent's Steward wallet and return its EOA. MUST be
	 * idempotent on `agentId`: a second call with the same id returns the same
	 * address and `created=false`.
	 */
	ensureAgentWallet(args: { agentId: string; name: string; platformId?: string }): Promise<MintedStewardWallet>;
}

/**
 * Build a {@link StewardWalletClient} from env. Returns null when Steward is
 * not configured (so callers can leave the wallet pending rather than throw):
 *   - STEWARD_API_URL   — Steward base, e.g. "https://eliza.steward.fi"
 *   - STEWARD_API_KEY   — tenant-scoped key (X-Steward-Key)
 *   - STEWARD_TENANT_ID — tenant id (defaults to "waifu")
 */
export function buildStewardWalletClientFromEnv(env: NodeJS.ProcessEnv = process.env): StewardWalletClient | null {
	const baseUrl = env.STEWARD_API_URL;
	const apiKey = env.STEWARD_API_KEY;
	if (!baseUrl || !apiKey) return null;
	const tenantId = env.STEWARD_TENANT_ID?.trim() || "waifu";
	const client = createStewardClient({ baseUrl, apiKey, tenantId });
	return createStewardWalletClient(client, tenantId);
}

/**
 * Adapt a raw {@link StewardClient} into the narrow {@link StewardWalletClient}
 * the launch path needs. `ensureAgentWallet` distinguishes create-vs-reuse by
 * probing `getAgent` first, then creating only on a clean miss.
 */
export function createStewardWalletClient(client: StewardClient, tenantId: string): StewardWalletClient {
	return {
		async ensureAgentWallet({ agentId, name, platformId }) {
			// Probe first so we can report create-vs-reuse honestly AND so a retry
			// after a successful prior mint reuses the SAME EOA (idempotency).
			let existing: Awaited<ReturnType<StewardClient["getAgent"]>> | null = null;
			try {
				existing = await client.getAgent(agentId);
			} catch (err) {
				// 404 / 4xx "missing" -> fall through to create. Re-throw genuine
				// server/network failures so we don't silently mask Steward outages.
				if (err instanceof StewardError && err.status >= 500) throw err;
				existing = null;
			}

			if (existing?.walletAddress) {
				return {
					stewardAgentId: existing.id,
					tenantId: existing.tenantId ?? tenantId,
					walletAddress: existing.walletAddress,
					solanaAddress: existing.walletAddresses?.solana ?? null,
					created: false,
				};
			}

			// Clean miss -> mint. createWallet does NOT re-probe (unlike
			// ensureAgent), so the call shape is exactly one POST /agents. If a
			// concurrent caller raced us, recover by re-reading the now-existing record.
			try {
				const minted = await client.createWallet(agentId, name, platformId);
				return {
					stewardAgentId: minted.id,
					tenantId: minted.tenantId ?? tenantId,
					walletAddress: minted.walletAddress,
					solanaAddress: minted.walletAddresses?.solana ?? null,
					created: true,
				};
			} catch (err) {
				if (err instanceof StewardError && (err.status === 409 || err.status === 400)) {
					const raced = await client.getAgent(agentId);
					return {
						stewardAgentId: raced.id,
						tenantId: raced.tenantId ?? tenantId,
						walletAddress: raced.walletAddress,
						solanaAddress: raced.walletAddresses?.solana ?? null,
						created: false,
					};
				}
				throw err;
			}
		},
	};
}
