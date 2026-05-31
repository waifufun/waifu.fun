/**
 * Bags (Solana / Meteora) launch executor.
 *
 * The bags equivalent of the BSC orchestrator's `broadcastPrepared`: takes a
 * prepared launch plan (built by `bagsAdapter.buildCreateTokenTx`) and runs the
 * REAL Bags v2 launch flow, signing + sending Solana transactions with a
 * provided launch-wallet keypair, then returns `{ tokenMint, signature }`.
 *
 * Bags v2 launch flow (https://docs.bags.fm):
 *   1. POST /token-launch/create-token-info   (multipart) -> { tokenMint, tokenMetadata }
 *   2. POST /fee-share/config                  (json)      -> { meteoraConfigKey, transactions[] }
 *      Sign + send each returned transaction (creates the fee-share config).
 *   3. POST /token-launch/create-launch-transaction (json) -> base58 versioned tx
 *      (already partially signed with the token mint); co-sign with the launch wallet.
 *   4. POST /solana/send-transaction           (json)      -> launch signature
 *
 * Auth: `x-api-key` (the Bags API key). For agent wallets, the key is obtained
 * via the agent-auth flow (`/agent/v2/auth/init` + `/agent/v2/auth/callback`);
 * we accept a pre-resolved API key here and document the agent-auth handshake
 * in the executor config / go-live checklist.
 *
 * Fee model (no waifu contract): Bags' fee-share config enforces the
 * creator/platform split on Meteora; we do NOT deploy a waifu splitter on
 * Solana. The split bps come from the plan's `/fee-share/config` body.
 *
 * Solana signing is injected via `SolanaSigner` so the launchpad package does
 * not hard-depend on a specific web3.js version at the type level; the default
 * keypair signer (`keypairSignerFromSecret`) uses `@solana/web3.js` + `bs58`.
 */

import type { BagsExternalPlan } from "../../types.js";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Signs Solana transactions. `publicKey` is the base58 launch-wallet address;
 * `signTransactions` takes base58-serialized (versioned) transactions and
 * returns them re-serialized base58 with the wallet's signature added.
 */
export interface SolanaSigner {
	publicKey: string;
	signTransactions(base58Txs: string[]): Promise<string[]>;
}

export interface BagsExecutorConfig {
	/** Bags API key. Sent as `x-api-key`. Required. */
	apiKey: string;
	/** Signs the launch + fee-share transactions with the launch wallet. */
	signer: SolanaSigner;
	/** Base URL override (defaults to the plan's baseUrl). */
	baseUrl?: string;
	/** Injected fetch for tests. */
	fetchImpl?: typeof fetch;
	/** Hook for structured logging. Secrets are never passed in. */
	onStep?: (step: string, detail: Record<string, unknown>) => void;
}

export interface BagsLaunchResult {
	tokenMint: string;
	tokenMetadata: string;
	configKey: string;
	/** Launch transaction signature. */
	signature: string;
	/** Signatures of any fee-share config setup transactions sent first. */
	feeShareSignatures: string[];
}

export class BagsExecutorError extends Error {
	constructor(
		readonly step: string,
		message: string,
		readonly detail?: unknown,
	) {
		super(message);
		this.name = "BagsExecutorError";
	}
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function unwrap(body: unknown): JsonRecord | null {
	const top = asRecord(body);
	if (!top) return null;
	// Bags wraps successful payloads under `response`.
	return asRecord(top.response) ?? top;
}

/**
 * Execute a prepared Bags launch plan against the real Bags API + Solana RPC.
 */
export async function executeBagsLaunch(plan: BagsExternalPlan, config: BagsExecutorConfig): Promise<BagsLaunchResult> {
	if (plan.kind !== "bags") {
		throw new BagsExecutorError("validate", "executeBagsLaunch requires a bags launch plan");
	}
	if (!config.apiKey) {
		throw new BagsExecutorError("auth", "BAGS_API_KEY is required to execute a Bags launch");
	}
	if (!config.signer?.publicKey || !SOLANA_ADDRESS_RE.test(config.signer.publicKey)) {
		throw new BagsExecutorError("validate", "a Solana launch-wallet signer is required");
	}
	if (plan.simulateOnly) {
		throw new BagsExecutorError(
			"validate",
			"refusing to execute a simulateOnly plan as a real launch; rebuild the plan with simulateOnly=false",
		);
	}

	const fetchImpl = config.fetchImpl ?? fetch;
	const baseUrl = config.baseUrl ?? plan.baseUrl;
	const headers: Record<string, string> = { "Content-Type": "application/json", "x-api-key": config.apiKey };
	const wallet = config.signer.publicKey;

	const [infoStep, feeStep, launchStep] = plan.steps;

	// ---- Step 1: create-token-info (multipart) ----
	// The plan body carries name/symbol/description/imageUrl; we re-send as
	// multipart/form-data per the Bags spec (imageUrl path, no binary upload).
	config.onStep?.("bags.tokenInfo.request", { name: infoStep.body.name, symbol: infoStep.body.symbol });
	const form = new FormData();
	form.append("name", infoStep.body.name);
	form.append("symbol", infoStep.body.symbol);
	form.append("description", infoStep.body.description);
	form.append("imageUrl", infoStep.body.imageUrl);
	if (infoStep.body.website) form.append("website", infoStep.body.website);
	if (infoStep.body.twitter) form.append("twitter", infoStep.body.twitter);
	if (infoStep.body.telegram) form.append("telegram", infoStep.body.telegram);

	const infoRes = await postMultipart(fetchImpl, `${baseUrl}${infoStep.endpoint}`, config.apiKey, form);
	const infoBody = unwrap(safeJson(infoRes.text));
	if (!infoRes.ok || !infoBody) {
		throw new BagsExecutorError("bags.tokenInfo", `create-token-info failed (HTTP ${infoRes.status})`, infoRes.text);
	}
	const tokenMint = pickString(infoBody, ["tokenMint"]);
	const tokenMetadata = pickString(infoBody, ["tokenMetadata", "uri"]);
	if (!tokenMint || !tokenMetadata) {
		throw new BagsExecutorError("bags.tokenInfo", "create-token-info missing tokenMint/tokenMetadata", infoBody);
	}
	config.onStep?.("bags.tokenInfo.resolved", { tokenMint });

	// ---- Step 2: fee-share/config -> sign + send returned transactions ----
	const feeBody = {
		...feeStep.body,
		payer: wallet,
		baseMint: tokenMint,
		...(plan.bagsConfigType ? { bagsConfigType: plan.bagsConfigType } : {}),
	};
	config.onStep?.("bags.feeShare.request", { baseMint: tokenMint, bps: feeStep.body.basisPointsArray });
	const feeRes = await postJson(fetchImpl, `${baseUrl}${feeStep.endpoint}`, headers, feeBody);
	const feeResolved = unwrap(safeJson(feeRes.text));
	if (!feeRes.ok || !feeResolved) {
		throw new BagsExecutorError("bags.feeShare", `fee-share/config failed (HTTP ${feeRes.status})`, feeRes.text);
	}
	const configKey = pickString(feeResolved, ["meteoraConfigKey", "configKey"]);
	if (!configKey) {
		throw new BagsExecutorError("bags.feeShare", "fee-share/config missing meteoraConfigKey", feeResolved);
	}

	// The config may need creating: sign + send the returned transactions (and
	// any bundles) before launching. Bags docs require submitting returned txs;
	// only skip when the API explicitly says the config already exists.
	const feeShareSignatures: string[] = [];
	const feeTxs = collectFeeShareTxs(feeResolved);
	if (feeResolved.needsCreation !== false && feeTxs.length > 0) {
		const signed = await config.signer.signTransactions(feeTxs);
		for (const tx of signed) {
			const sig = await sendTransaction(fetchImpl, baseUrl, headers, tx, config.onStep);
			feeShareSignatures.push(sig);
		}
		config.onStep?.("bags.feeShare.created", { count: feeShareSignatures.length });
	}

	// ---- Step 3: create-launch-transaction -> co-sign ----
	const launchReqBody = {
		ipfs: tokenMetadata,
		tokenMint,
		wallet,
		initialBuyLamports: launchStep.body.initialBuyLamports,
		configKey,
	};
	config.onStep?.("bags.launchTx.request", { tokenMint, initialBuyLamports: launchStep.body.initialBuyLamports });
	const launchRes = await postJson(fetchImpl, `${baseUrl}${launchStep.endpoint}`, headers, launchReqBody);
	const launchResolved = unwrap(safeJson(launchRes.text));
	const launchTxB58 =
		typeof launchResolved === "object" && launchResolved
			? pickString(launchResolved, ["transaction", "tx"])
			: typeof asRecord(safeJson(launchRes.text))?.response === "string"
				? (asRecord(safeJson(launchRes.text))?.response as string)
				: undefined;
	const launchTx = launchTxB58 ?? extractTopLevelResponseString(safeJson(launchRes.text));
	if (!launchRes.ok || !launchTx) {
		throw new BagsExecutorError(
			"bags.launchTx",
			`create-launch-transaction failed (HTTP ${launchRes.status})`,
			launchRes.text,
		);
	}

	const [signedLaunchTx] = await config.signer.signTransactions([launchTx]);
	if (!signedLaunchTx) {
		throw new BagsExecutorError("bags.sign", "launch wallet failed to sign the launch transaction");
	}

	// ---- Step 4: send-transaction -> signature ----
	const signature = await sendTransaction(fetchImpl, baseUrl, headers, signedLaunchTx, config.onStep);
	config.onStep?.("bags.launch.resolved", { tokenMint, signature });

	return { tokenMint, tokenMetadata, configKey, signature, feeShareSignatures };
}

/** Collect base58 txs from the fee-share response (`transactions[]` + `bundles[][]`). */
function collectFeeShareTxs(resolved: JsonRecord): string[] {
	const out: string[] = [];
	const txs = resolved.transactions;
	if (Array.isArray(txs)) {
		for (const t of txs) {
			const rec = asRecord(t);
			const tx = rec ? pickString(rec, ["transaction", "tx"]) : typeof t === "string" ? t : undefined;
			if (tx) out.push(tx);
		}
	}
	const bundles = resolved.bundles;
	if (Array.isArray(bundles)) {
		for (const bundle of bundles) {
			if (!Array.isArray(bundle)) continue;
			for (const t of bundle) {
				const rec = asRecord(t);
				const tx = rec ? pickString(rec, ["transaction", "tx"]) : typeof t === "string" ? t : undefined;
				if (tx) out.push(tx);
			}
		}
	}
	return out;
}

function extractTopLevelResponseString(body: unknown): string | undefined {
	const top = asRecord(body);
	if (top && typeof top.response === "string" && top.response.length > 0) return top.response;
	return undefined;
}

async function sendTransaction(
	fetchImpl: typeof fetch,
	baseUrl: string,
	headers: Record<string, string>,
	transaction: string,
	onStep?: (step: string, detail: Record<string, unknown>) => void,
): Promise<string> {
	const res = await postJson(fetchImpl, `${baseUrl}/solana/send-transaction`, headers, { transaction });
	const body = safeJson(res.text);
	const top = asRecord(body);
	const signature =
		(top && typeof top.response === "string" ? top.response : undefined) ??
		(top ? pickString(top, ["signature", "txSignature"]) : undefined);
	if (!res.ok || !signature) {
		throw new BagsExecutorError("bags.send", `send-transaction failed (HTTP ${res.status})`, res.text);
	}
	onStep?.("bags.send.ok", { signature });
	return signature;
}

async function postJson(
	fetchImpl: typeof fetch,
	url: string,
	headers: Record<string, string>,
	body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
	let res: Response;
	try {
		res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
	} catch (err) {
		throw new BagsExecutorError("bags.network", `network error calling ${url}: ${stringifyError(err)}`, err);
	}
	return { ok: res.ok, status: res.status, text: await res.text() };
}

async function postMultipart(
	fetchImpl: typeof fetch,
	url: string,
	apiKey: string,
	form: FormData,
): Promise<{ ok: boolean; status: number; text: string }> {
	let res: Response;
	try {
		// Do NOT set Content-Type; the runtime sets the multipart boundary.
		res = await fetchImpl(url, { method: "POST", headers: { "x-api-key": apiKey }, body: form });
	} catch (err) {
		throw new BagsExecutorError("bags.network", `network error calling ${url}: ${stringifyError(err)}`, err);
	}
	return { ok: res.ok, status: res.status, text: await res.text() };
}

function stringifyError(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
