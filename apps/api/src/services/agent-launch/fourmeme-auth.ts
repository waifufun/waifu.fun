/**
 * Four.Meme SIWE-style login.
 *
 * Flow (per /tmp/fourmeme-docs/API-CreateToken.md):
 *   1. POST /v1/private/user/nonce/generate
 *        { accountAddress, verifyType: "LOGIN", networkCode: "BSC" }
 *        → { code: "0", data: "<nonce>" }
 *   2. Sign the message "You are sign in Meme {nonce}" with the agent wallet.
 *   3. POST /v1/private/user/login/dex
 *        { region, langType, loginIp, inviteCode,
 *          verifyInfo: { address, networkCode, signature, verifyType: "LOGIN" },
 *          walletName }
 *        → { code: "0", data: "<access_token>" }
 *
 * The signer is abstracted — we pass in an async `signMessage(address, msg)`
 * so the orchestrator can plug the Steward-backed signer or a local wallet
 * (for tests) in without this module knowing the difference.
 */

import type { Address } from "viem";

import { FourMemeError } from "./errors.js";

export const FOURMEME_API_BASE = "https://four.meme/meme-api";

export type SignMessageFn = (address: Address, message: string) => Promise<string>;

export interface FourMemeAuthOptions {
	/** Override base URL (for local staging/mocks). */
	baseUrl?: string | undefined;
	/** Override fetch (tests). */
	fetchImpl?: typeof fetch | undefined;
	/** Override walletName reported to Four.Meme. */
	walletName?: string | undefined;
	/** Optional invite code (Four.Meme referral). */
	inviteCode?: string | undefined;
	/** Optional loginIp (Four.Meme uses this for analytics). */
	loginIp?: string | undefined;
	/** `WEB` per docs. */
	region?: string | undefined;
	/** `EN` per docs. */
	langType?: string | undefined;
}

export interface FourMemeAuthResult {
	accessToken: string;
	nonce: string;
}

export async function fourMemeLogin(
	address: Address,
	signMessage: SignMessageFn,
	opts: FourMemeAuthOptions = {},
): Promise<FourMemeAuthResult> {
	const baseUrl = (opts.baseUrl ?? FOURMEME_API_BASE).replace(/\/+$/, "");
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);

	// 1. nonce
	const nonceRes = await fetchImpl(`${baseUrl}/v1/private/user/nonce/generate`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({
			accountAddress: address,
			verifyType: "LOGIN",
			networkCode: "BSC",
		}),
	});
	const noncePayload = await readJson(nonceRes, "nonce/generate");
	const nonce = extractData<string>(noncePayload, "nonce/generate");
	if (!nonce || typeof nonce !== "string") {
		throw new FourMemeError("nonce/generate returned empty nonce", nonceRes.status, noncePayload);
	}

	// 2. sign the exact message from the docs
	const message = `You are sign in Meme ${nonce}`;
	const signature = await signMessage(address, message);
	if (!signature || typeof signature !== "string") {
		throw new FourMemeError("signMessage returned empty signature", 0);
	}

	// 3. login/dex
	const loginBody = {
		region: opts.region ?? "WEB",
		langType: opts.langType ?? "EN",
		loginIp: opts.loginIp ?? "",
		inviteCode: opts.inviteCode ?? "",
		verifyInfo: {
			address,
			networkCode: "BSC",
			signature,
			verifyType: "LOGIN",
		},
		walletName: opts.walletName ?? "MetaMask",
	};

	const loginRes = await fetchImpl(`${baseUrl}/v1/private/user/login/dex`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify(loginBody),
	});
	const loginPayload = await readJson(loginRes, "login/dex");
	const accessToken = extractData<string>(loginPayload, "login/dex");
	if (!accessToken || typeof accessToken !== "string") {
		throw new FourMemeError("login/dex returned empty access token", loginRes.status, loginPayload);
	}

	return { accessToken, nonce };
}

async function readJson(response: Response, label: string): Promise<unknown> {
	const text = await response.text();
	if (!text) {
		if (!response.ok) {
			throw new FourMemeError(`Four.Meme ${label} failed with empty body`, response.status);
		}
		return {};
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new FourMemeError(`Four.Meme ${label} returned non-JSON (status ${response.status})`, response.status, {
			body: text.slice(0, 500),
		});
	}
}

function extractData<T>(payload: unknown, label: string): T {
	if (!payload || typeof payload !== "object") {
		throw new FourMemeError(`Four.Meme ${label}: invalid payload`, 0, payload);
	}
	const obj = payload as { code?: unknown; data?: T; msg?: unknown };
	if (obj.code !== "0" && obj.code !== 0) {
		throw new FourMemeError(`Four.Meme ${label} returned error: ${String(obj.msg ?? obj.code)}`, 0, obj);
	}
	return obj.data as T;
}
