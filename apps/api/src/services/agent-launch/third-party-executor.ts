/**
 * External launch executor seam for API-driven launchpads (bankr, bags).
 *
 * This is the bankr/bags analog of the BSC orchestrator's broadcast step. The
 * v3 launch route prepares a plan (`adapter.buildCreateTokenTx`) and stores the
 * `third-party` plan on the persona; this module takes that prepared plan and runs
 * the REAL launch (HTTP deploy for bankr; multi-step Solana flow for bags),
 * returning a normalized result the route persists into the same tables the BSC
 * path uses (agent_personas.tokenAddress + launchTxHash via markLaunched).
 *
 * Everything is env-gated. If creds are missing, `isBankrExecutorConfigured` /
 * `isBagsExecutorConfigured` return false and the route returns a clear
 * "not configured" error instead of pretending to launch.
 *
 * Integration note (Shaw's provisioning pipeline, #834): this seam intentionally
 * mirrors the orchestrator interface (prepare -> execute) so the provisioning
 * pipeline can call `executeExternalLaunch` after a prepared launch the same way
 * it calls `broadcastPrepared` for BSC. Do not inline the API calls into the
 * pipeline; call through this seam.
 */

import {
	type BagsExecutorConfig,
	type BagsExternalPlan,
	type BankrExecutorConfig,
	type BankrExternalPlan,
	type ExternalLaunchPlan,
	executeBagsLaunch,
	executeBankrLaunch,
} from "@waifufun/launchpad";
import { envSolanaSigner } from "@waifufun/launchpad/adapters/bags/signer";

export interface ExternalLaunchResult {
	/** EVM address (bankr) or Solana mint (bags). */
	tokenAddress: string;
	/** Doppler poolId (bankr) or Bags configKey (bags). */
	curveAddress?: string;
	/** EVM tx hash (bankr) or Solana signature (bags). */
	txHash?: string;
	chain: "base" | "solana";
	raw: unknown;
}

export function isBankrExecutorConfigured(): boolean {
	return Boolean(process.env.BANKR_API_KEY);
}

export function isBagsExecutorConfigured(): boolean {
	return Boolean(
		process.env.BAGS_API_KEY && (process.env.BAGS_LAUNCH_SIGNER_SECRET || process.env.SOLANA_LAUNCH_SIGNER_SECRET),
	);
}

function bankrConfigFromEnv(): BankrExecutorConfig {
	const apiKey = process.env.BANKR_API_KEY;
	if (!apiKey) throw new Error("BANKR_API_KEY is not configured");
	return {
		apiKey,
		...(process.env.BANKR_PARTNER_KEY ? { partnerKey: process.env.BANKR_PARTNER_KEY } : {}),
		...(process.env.BANKR_API_URL ? { baseUrl: process.env.BANKR_API_URL } : {}),
		onStep: (step, detail) => console.info(`[bankr-launch] ${step}`, detail),
	};
}

function bagsConfigFromEnv(): BagsExecutorConfig {
	const apiKey = process.env.BAGS_API_KEY;
	if (!apiKey) throw new Error("BAGS_API_KEY is not configured");
	const signer = envSolanaSigner();
	if (!signer) throw new Error("BAGS_LAUNCH_SIGNER_SECRET (or SOLANA_LAUNCH_SIGNER_SECRET) is not configured");
	return {
		apiKey,
		signer,
		...(process.env.BAGS_API_URL ? { baseUrl: process.env.BAGS_API_URL } : {}),
		onStep: (step, detail) => console.info(`[bags-launch] ${step}`, detail),
	};
}

/**
 * Execute a prepared third-party launch plan. The plan is the `tx.third-party` object
 * that `buildCreateTokenTx` returned and the route stored on the persona.
 */
export async function executeExternalLaunch(plan: ExternalLaunchPlan): Promise<ExternalLaunchResult> {
	if (plan.kind === "bankr") {
		if (!isBankrExecutorConfigured()) {
			throw new Error("Bankr executor not configured: set BANKR_API_KEY to enable live Base launches");
		}
		const result = await executeBankrLaunch(plan as BankrExternalPlan, bankrConfigFromEnv());
		return {
			tokenAddress: result.tokenAddress,
			curveAddress: result.poolId,
			...(result.txHash ? { txHash: result.txHash } : {}),
			chain: "base",
			raw: result.raw,
		};
	}
	if (plan.kind === "bags") {
		if (!isBagsExecutorConfigured()) {
			throw new Error(
				"Bags executor not configured: set BAGS_API_KEY + BAGS_LAUNCH_SIGNER_SECRET to enable live Solana launches",
			);
		}
		const result = await executeBagsLaunch(plan as BagsExternalPlan, bagsConfigFromEnv());
		return {
			tokenAddress: result.tokenMint,
			curveAddress: result.configKey,
			txHash: result.signature,
			chain: "solana",
			raw: result,
		};
	}
	throw new Error(`unsupported third-party launch plan kind: ${(plan as { kind?: string }).kind ?? "unknown"}`);
}
