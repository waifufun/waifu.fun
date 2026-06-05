/**
 * BNB -> Eliza Cloud credits off-ramp.
 *
 * Background (verified live 2026-06-03 against api.elizacloud.ai):
 *  - Eliza Cloud credits are ORG-LEVEL. `GET /api/v1/credits/balance` returns the
 *    same balance for any (or no) `agent_id` — all waifu hosted agents share ONE
 *    platform org credit pool. Per-agent "dormant" is a waifu-core construct.
 *  - There is NO service-key credit-grant API. Every mint requires a real payment.
 *  - The ONE real "we operate it ourselves" path is Eliza Cloud's directWallet
 *    crypto payment: send BNB to a BSC receive address, submit the tx hash, Eliza
 *    Cloud verifies on-chain and mints credits to the platform org.
 *  - AUTH WALL: the crypto create/confirm routes are gated by `requireAuthWithOrg`
 *    and REJECT the API/service key (401). They need a platform USER SESSION token
 *    (ELIZA_CLOUD_SESSION_TOKEN). Without it the off-ramp is NOT automatable; this
 *    service returns honest manual instructions rather than pretending to mint.
 *
 * This module:
 *  1. Resolves the live BSC receive address + BNB price (snapshot at conversion).
 *  2. Converts a USD amount <-> BNB and runs the real directWallet create+confirm
 *     when a session token is present (and a real on-chain tx hash is supplied).
 *  3. Detects new inbound BSC deposits to an agent Safe (reusing the burn-rate
 *     Ankr/BscScan polling) and turns a configurable slice into a *pending*
 *     conversion intent — surfaced for ops/patron confirmation, never silently
 *     moving funds.
 */

import type {
	ElizaCryptoNetwork,
	ElizaCryptoPaymentConfirmResult,
	ElizaCryptoPaymentCreateResult,
	ElizaCryptoStatus,
} from "../eliza-client.js";
import { fetchBnbPriceUsd } from "../nav/pricing/coingecko.js";
import { BSC_USDT_CONTRACT } from "./deposit-watcher.js";

/** Minimal slice of the Eliza Cloud client the off-ramp needs. */
export interface OffRampElizaClient {
	getCryptoStatus(): Promise<ElizaCryptoStatus>;
	createCryptoPayment(input: {
		amountUsd: number;
		payCurrency?: string;
		network?: string;
		currency?: string;
	}): Promise<ElizaCryptoPaymentCreateResult>;
	confirmCryptoPayment(paymentId: string, transactionHash: string): Promise<ElizaCryptoPaymentConfirmResult>;
	hasCryptoSession(): boolean;
}

export type OffRampDeps = {
	priceUsd: () => Promise<number | null>;
	now: () => number;
};

const defaultDeps: OffRampDeps = {
	priceUsd: () => fetchBnbPriceUsd(),
	now: () => Date.now(),
};

/** Eliza Cloud network id accepted by createCryptoPayment for BSC/BEP20. */
export const BSC_NETWORK_ID = "BEP20";
export const BSC_USDT_PAY_CURRENCY = "USDT";
/** Eliza Cloud `directWallet.networks[].network` key for BSC. */
const BSC_DIRECT_WALLET_KEY = "bsc";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export interface BscReceiveTarget {
	network: string;
	chainId?: number;
	receiveAddress: string;
	tokenSymbol?: string;
	promotion?: { minimumUsd?: number; bonusCredits?: number };
}

export interface OffRampQuote {
	usd: number;
	bnb: number;
	bnbPriceUsd: number;
	receiveAddress: string;
	chainId?: number;
	network: string;
	promotion?: { minimumUsd?: number; bonusCredits?: number };
	/** True when waifu-core can run the directWallet create+confirm itself. */
	automatable: boolean;
}

export interface ManualOffRampInstructions {
	automatable: false;
	reason: string;
	receiveAddress: string;
	chainId?: number;
	network: string;
	usd: number;
	bnb: number;
	bnbPriceUsd: number;
	steps: string[];
}

export interface OffRampConversionResult {
	automatable: true;
	paymentId: string;
	transactionHash: string;
	usd: number;
	bnb: number;
	bnbPriceUsd: number;
	creditsAdded?: number | string;
	status?: string;
}

/**
 * A pending conversion intent derived from a detected BSC Safe deposit. Recorded
 * for ops/patron confirmation; NOT an automatic money move.
 */
export interface ConversionIntent {
	depositTxHash: string;
	agentTokenAddress: string;
	safeAddress: string;
	depositBnb: number;
	creditsShareBps: number;
	convertBnb: number;
	convertUsd: number | null;
	bnbPriceUsd: number | null;
	receiveAddress: string;
	createdAt: number;
}

function roundBnb(value: number): number {
	return Number(value.toFixed(12));
}

function roundUsd(value: number): number {
	return Number(value.toFixed(2));
}

function pickBscNetwork(status: ElizaCryptoStatus): ElizaCryptoNetwork | null {
	const networks = status.directWallet?.networks ?? [];
	const bsc = networks.find((n) => n.network?.toLowerCase() === BSC_DIRECT_WALLET_KEY && n.enabled !== false);
	if (!bsc || !bsc.receiveAddress) return null;
	return bsc;
}

function bscSupportsCanonicalUsdt(bsc: ElizaCryptoNetwork): boolean {
	const topLevel =
		bsc.tokenSymbol?.toUpperCase() === BSC_USDT_PAY_CURRENCY &&
		bsc.tokenAddress?.toLowerCase() === BSC_USDT_CONTRACT &&
		bsc.tokenDecimals === 18;
	const tokenList = (bsc.tokens ?? []).some(
		(token) =>
			token.symbol?.toUpperCase() === BSC_USDT_PAY_CURRENCY &&
			token.kind?.toLowerCase() === "bep20" &&
			token.tokenAddress?.toLowerCase() === BSC_USDT_CONTRACT &&
			token.decimals === 18,
	);
	return topLevel || tokenList;
}

function isUsdtPayCurrency(value: string | undefined): boolean {
	return value?.toUpperCase() === BSC_USDT_PAY_CURRENCY;
}

export class CreditsOffRamp {
	constructor(
		private readonly eliza: OffRampElizaClient,
		private readonly deps: OffRampDeps = defaultDeps,
	) {}

	/** Resolve the live BSC directWallet receive target, or null if unavailable. */
	async resolveBscTarget(): Promise<BscReceiveTarget | null> {
		const status = await this.eliza.getCryptoStatus();
		if (!status.enabled || status.directWallet?.enabled === false) return null;
		const bsc = pickBscNetwork(status);
		if (!bsc) return null;
		const promo = status.directWallet?.promotion;
		const promotion =
			promo && promo.network?.toLowerCase() === BSC_DIRECT_WALLET_KEY
				? {
						...(promo.minimumUsd !== undefined ? { minimumUsd: promo.minimumUsd } : {}),
						...(promo.bonusCredits !== undefined ? { bonusCredits: promo.bonusCredits } : {}),
					}
				: undefined;
		return {
			network: BSC_NETWORK_ID,
			...(bsc.chainId !== undefined ? { chainId: bsc.chainId } : {}),
			receiveAddress: bsc.receiveAddress,
			...(bsc.tokenSymbol !== undefined ? { tokenSymbol: bsc.tokenSymbol } : {}),
			...(promotion ? { promotion } : {}),
		};
	}

	/**
	 * Quote a USD top-up: how much BNB to send, to which address, at what price,
	 * and whether waifu-core can execute it automatically.
	 */
	async quoteUsd(usd: number): Promise<OffRampQuote> {
		if (!(usd > 0)) throw new Error("usd must be a positive number");
		const target = await this.resolveBscTarget();
		if (!target) throw new Error("Eliza Cloud BSC directWallet off-ramp is unavailable");
		const bnbPriceUsd = await this.deps.priceUsd();
		if (bnbPriceUsd === null || !(bnbPriceUsd > 0)) {
			throw new Error("BNB price unavailable; cannot quote off-ramp");
		}
		const bnb = roundBnb(usd / bnbPriceUsd);
		return {
			usd: roundUsd(usd),
			bnb,
			bnbPriceUsd,
			receiveAddress: target.receiveAddress,
			...(target.chainId !== undefined ? { chainId: target.chainId } : {}),
			network: target.network,
			...(target.promotion ? { promotion: target.promotion } : {}),
			automatable: this.eliza.hasCryptoSession(),
		};
	}

	/** Honest manual instructions when the off-ramp can't be automated. */
	async manualInstructions(usd: number, reason: string): Promise<ManualOffRampInstructions> {
		const quote = await this.quoteUsd(usd);
		return {
			automatable: false,
			reason,
			receiveAddress: quote.receiveAddress,
			...(quote.chainId !== undefined ? { chainId: quote.chainId } : {}),
			network: quote.network,
			usd: quote.usd,
			bnb: quote.bnb,
			bnbPriceUsd: quote.bnbPriceUsd,
			steps: [
				`Send ${quote.bnb} BNB (~$${quote.usd}) on BNB Smart Chain to ${quote.receiveAddress}.`,
				"In a logged-in elizacloud.ai platform session, create a crypto payment for the same USD amount (network BSC, currency BNB).",
				"Submit the on-chain transaction hash to confirm the payment; Eliza Cloud verifies it on-chain and mints credits to the platform org.",
				"On confirmation Eliza Cloud fires the credits.topped_up webhook, which clears the agent's dormant_at.",
			],
		};
	}

	/**
	 * Execute the real directWallet off-ramp: create a payment for `usd`, then
	 * confirm it with the supplied on-chain tx hash (the BNB transfer to the
	 * receive address). REQUIRES a platform session token AND a real tx hash.
	 * Returns a discriminated result; the caller decides what to do with the
	 * manual fallback.
	 */
	async convert(input: {
		usd: number;
		transactionHash: string;
		payCurrency?: string;
	}): Promise<OffRampConversionResult | ManualOffRampInstructions> {
		if (!this.eliza.hasCryptoSession()) {
			return this.manualInstructions(
				input.usd,
				"No platform session token configured (ELIZA_CLOUD_SESSION_TOKEN). Crypto credit minting requires a logged-in platform session; the service/API key is rejected by Eliza Cloud's crypto routes.",
			);
		}
		if (!TX_HASH_RE.test(input.transactionHash)) {
			throw new Error("transactionHash must be a 0x-prefixed 32-byte BSC tx hash");
		}
		if (!Number.isFinite(input.usd) || input.usd <= 0) {
			throw new Error("usd must be positive");
		}
		const payCurrency = input.payCurrency?.toUpperCase() ?? "BNB";
		const usdt = isUsdtPayCurrency(payCurrency);
		const target = usdt ? await this.resolveBscTarget() : null;
		if (usdt && (!target || target.network !== BSC_NETWORK_ID)) {
			throw new Error("Eliza Cloud BSC USDT directWallet target is unavailable");
		}
		if (usdt) {
			const status = await this.eliza.getCryptoStatus();
			const bsc = pickBscNetwork(status);
			if (!bsc || !bscSupportsCanonicalUsdt(bsc)) {
				throw new Error("Eliza Cloud status does not advertise canonical BSC USDT (BEP20, 18 decimals)");
			}
		}
		const quote = usdt
			? { usd: roundUsd(input.usd), bnb: 0, bnbPriceUsd: 0 }
			: await this.quoteUsd(input.usd);
		const created = await this.eliza.createCryptoPayment({
			amountUsd: quote.usd,
			payCurrency: usdt ? BSC_USDT_PAY_CURRENCY : payCurrency,
			network: BSC_NETWORK_ID,
		});
		const confirmed = await this.eliza.confirmCryptoPayment(created.paymentId, input.transactionHash);
		return {
			automatable: true,
			paymentId: created.paymentId,
			transactionHash: input.transactionHash,
			usd: quote.usd,
			bnb: quote.bnb,
			bnbPriceUsd: quote.bnbPriceUsd,
			...(confirmed.creditsAdded !== undefined ? { creditsAdded: confirmed.creditsAdded } : {}),
			...(confirmed.status !== undefined ? { status: confirmed.status } : {}),
		};
	}

	/**
	 * Build a pending conversion intent from a detected inbound BSC deposit.
	 * Converts a `creditsShareBps` slice of the deposit into a credit-funding
	 * intent (idempotency + persistence are the caller's responsibility). This
	 * does NOT move funds — it surfaces a candidate for ops/patron confirmation.
	 */
	async buildConversionIntent(input: {
		depositTxHash: string;
		agentTokenAddress: string;
		safeAddress: string;
		depositBnb: number;
		creditsShareBps: number;
	}): Promise<ConversionIntent> {
		const shareBps = Math.max(0, Math.min(10_000, Math.floor(input.creditsShareBps)));
		const convertBnb = roundBnb((input.depositBnb * shareBps) / 10_000);
		const target = await this.resolveBscTarget();
		const bnbPriceUsd = await this.deps.priceUsd();
		const convertUsd = bnbPriceUsd && bnbPriceUsd > 0 ? roundUsd(convertBnb * bnbPriceUsd) : null;
		return {
			depositTxHash: input.depositTxHash,
			agentTokenAddress: input.agentTokenAddress.toLowerCase(),
			safeAddress: input.safeAddress.toLowerCase(),
			depositBnb: roundBnb(input.depositBnb),
			creditsShareBps: shareBps,
			convertBnb,
			convertUsd,
			bnbPriceUsd: bnbPriceUsd ?? null,
			receiveAddress: target?.receiveAddress ?? "",
			createdAt: Math.floor(this.deps.now() / 1000),
		};
	}
}

export function __defaultOffRampDeps(): OffRampDeps {
	return { ...defaultDeps };
}
