/**
 * Four.Meme /v1/private/token/create wrapper.
 *
 * Returns the `(createArg, signature)` tuple that must be passed verbatim to
 * `TokenManager2.createToken(bytes args, bytes signature)` on BSC.
 *
 * The returned signature is single-use and pre-signs specific params —
 * callers MUST NOT mutate `createArg` before the on-chain call.
 */

import type { Address, Hex } from "viem";

import { FourMemeError } from "./errors.js";
import { FOURMEME_API_BASE } from "./fourmeme-auth.js";
import { FOURMEME_BNB_RAISED_TOKEN, type FourMemeLabel, type FourMemeTaxConfig } from "./types.js";

export interface FourMemeCreateTokenInput {
	name: string;
	shortName: string;
	desc: string;
	imgUrl: string;
	label?: FourMemeLabel | undefined;
	launchTime?: number | undefined; // ms
	webUrl?: string | undefined;
	twitterUrl?: string | undefined;
	telegramUrl?: string | undefined;
	preSale?: string | undefined; // "0" or "0.1"...
	onlyMPC?: boolean | undefined;
	feePlan?: boolean | undefined;
	tokenTaxInfo?: FourMemeTaxConfig | null | undefined;
	/** Default is BNB raised-token config baked into types.ts. */
	raisedToken?: Record<string, unknown> | undefined;
}

export interface FourMemeCreateTokenOptions {
	baseUrl?: string | undefined;
	fetchImpl?: typeof fetch | undefined;
}

export interface FourMemeCreateTokenResult {
	createArg: Hex;
	signature: Hex;
	/** If Four.Meme returns an internal id, surface it for DB bookkeeping. */
	requestId?: string | undefined;
	raw: unknown;
}

const VALID_LABELS: readonly FourMemeLabel[] = [
	"Meme",
	"AI",
	"Defi",
	"Games",
	"Infra",
	"De-Sci",
	"Social",
	"Depin",
	"Charity",
	"Others",
];

function validateInput(input: FourMemeCreateTokenInput): void {
	if (!input.name || input.name.length === 0) {
		throw new FourMemeError("create: name required", 0);
	}
	if (!input.shortName) throw new FourMemeError("create: shortName required", 0);
	if (!input.desc) throw new FourMemeError("create: desc required", 0);
	if (!input.imgUrl) throw new FourMemeError("create: imgUrl required", 0);
	if (input.label && !VALID_LABELS.includes(input.label)) {
		throw new FourMemeError(`create: label must be one of ${VALID_LABELS.join("|")}`, 0);
	}
	if (input.tokenTaxInfo) {
		const t = input.tokenTaxInfo;
		if (![1, 3, 5, 10].includes(t.feeRate)) {
			throw new FourMemeError("create: tokenTaxInfo.feeRate must be 1|3|5|10", 0);
		}
		const sum = t.burnRate + t.divideRate + t.liquidityRate + t.recipientRate;
		if (sum !== 100) {
			throw new FourMemeError(`create: tokenTaxInfo rates must sum to 100 (got ${sum})`, 0);
		}
		if (!t.recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(t.recipientAddress)) {
			throw new FourMemeError("create: tokenTaxInfo.recipientAddress must be a 0x-prefixed address", 0);
		}
		validateMinSharing(t.minSharing);
	}
}

function validateMinSharing(value: number): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new FourMemeError("create: minSharing must be a positive number", 0);
	}
	// minSharing = d * 10^n, n >= 5, 1 <= d <= 9
	let n = 0;
	let v = value;
	while (v >= 10 && Number.isInteger(v / 10)) {
		v = v / 10;
		n += 1;
	}
	if (!Number.isInteger(v) || v < 1 || v > 9 || n < 5) {
		throw new FourMemeError(`create: minSharing must be d*10^n (n>=5, 1<=d<=9). got ${value}`, 0);
	}
}

export async function fourMemeCreateToken(
	accessToken: string,
	input: FourMemeCreateTokenInput,
	opts: FourMemeCreateTokenOptions = {},
): Promise<FourMemeCreateTokenResult> {
	if (!accessToken) {
		throw new FourMemeError("create: accessToken required", 0);
	}
	validateInput(input);

	const baseUrl = (opts.baseUrl ?? FOURMEME_API_BASE).replace(/\/+$/, "");
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);

	// Body shape derived from four.meme's official SDK
	// (npm package `four-meme-ai`, `scripts/create-token-api.ts`).
	// Don't deviate from this shape — the API rejects subtly with
	// misleading errors ("symbol must not be null" when really
	// raisedAmount/totalSupply structure is wrong).
	const raisedToken = (input.raisedToken ?? FOURMEME_BNB_RAISED_TOKEN) as Record<string, unknown>;
	const raisedSymbol = (raisedToken.symbol as string | undefined) ?? "BNB";
	const totalSupply = Number((raisedToken.totalAmount as string | number | undefined) ?? 1_000_000_000);
	const raisedAmount = Number((raisedToken.totalBAmount as string | number | undefined) ?? 24);
	const saleRate = Number((raisedToken.saleRate as string | number | undefined) ?? 0.8);

	const body: Record<string, unknown> = {
		name: input.name,
		shortName: input.shortName,
		desc: input.desc,
		totalSupply,
		raisedAmount,
		saleRate,
		reserveRate: 0,
		imgUrl: input.imgUrl,
		raisedToken,
		launchTime: input.launchTime ?? Date.now(),
		funGroup: false,
		label: input.label ?? "AI",
		lpTradingFee: 0.0025,
		// Platform-default socials. Any input-supplied URL overrides these.
		// Rationale: every token launched via waifu.fun carries visible
		// attribution so Four.meme's UI links back to us. Patrons can
		// override via the edit flow if they've set up agent-specific socials.
		webUrl: input.webUrl ?? "https://waifu.fun",
		twitterUrl: input.twitterUrl ?? "https://x.com/waifudotfun",
		telegramUrl: input.telegramUrl ?? "",
		preSale: input.preSale ?? "0",
		clickFun: false,
		// Top-level symbol = raised-token symbol (BNB). NOT the new ticker.
		symbol: raisedSymbol,
		dexType: "PANCAKE_SWAP",
		rushMode: false,
		onlyMPC: input.onlyMPC ?? false,
		feePlan: input.feePlan ?? false,
	};
	if (input.tokenTaxInfo) {
		body.tokenTaxInfo = input.tokenTaxInfo;
	}

	const res = await fetchImpl(`${baseUrl}/v1/private/token/create`, {
		method: "POST",
		headers: {
			"meme-web-access": accessToken,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify(body),
	});

	const text = await res.text();
	let payload: unknown = {};
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			throw new FourMemeError(`create: non-JSON response (status ${res.status})`, res.status, {
				body: text.slice(0, 500),
			});
		}
	}

	const obj = payload as {
		code?: unknown;
		data?: unknown;
		msg?: unknown;
	};
	if (obj.code !== "0" && obj.code !== 0) {
		throw new FourMemeError(`create: Four.Meme returned error ${String(obj.msg ?? obj.code)}`, res.status, payload);
	}

	const data = obj.data as {
		createArg?: string;
		signature?: string;
		requestId?: string | number;
		sign?: string;
	} | null;
	if (!data || typeof data !== "object") {
		throw new FourMemeError("create: empty data in response", res.status, payload);
	}
	// Some older docs refer to `sign`; newer docs use `signature`. Accept both.
	const createArg = data.createArg;
	const signature = data.signature ?? data.sign;
	if (!createArg || !signature) {
		throw new FourMemeError("create: response missing createArg/signature", res.status, payload);
	}

	return {
		createArg: normalizeHex(createArg),
		signature: normalizeHex(signature),
		requestId: data.requestId !== undefined ? String(data.requestId) : undefined,
		raw: payload,
	};
}

function normalizeHex(value: string): Hex {
	const prefixed = value.startsWith("0x") ? value : `0x${value}`;
	if (!/^0x[0-9a-fA-F]*$/.test(prefixed)) {
		throw new FourMemeError(`create: malformed hex "${value}"`, 0);
	}
	return prefixed as Hex;
}

/**
 * Build a default TaxToken config for waifu agents. The `recipientAddress`
 * MUST be the agent treasury (Safe or Steward-managed wallet).
 */
export function defaultAgentTaxConfig(recipientAddress: Address): FourMemeTaxConfig {
	return {
		feeRate: 3,
		burnRate: 10,
		divideRate: 40,
		liquidityRate: 30,
		recipientRate: 20,
		recipientAddress,
		// 1,000,000 = 1 * 10^6, satisfies minSharing = d * 10^n, n>=5, 1<=d<=9
		minSharing: 1_000_000,
	};
}
