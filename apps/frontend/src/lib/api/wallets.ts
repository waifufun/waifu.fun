/**
 * Wallet management client (W9.7).
 *
 * Typed wrapper over the W9.6 SIWE bind-wallet endpoints in waifu-core.
 * All requests go through `apiFetch`, which attaches the patron's Steward
 * JWT as a Bearer token. The patron is identified by Steward; wallets are
 * additional EVM identities a patron has cryptographically proven control of.
 *
 *   POST   /v2/auth/siwe/nonce                       -> { nonce, expiresInSeconds }
 *   POST   /v2/auth/siwe/bind                        -> { ok, address, chainId }
 *   GET    /v2/auth/siwe/wallets                     -> { ok, wallets: PatronWallet[] }
 *   DELETE /v2/auth/siwe/wallets/:address            -> 200 (ok) | 204
 *   POST   /v2/auth/siwe/wallets/:address/primary    -> 200 (ok)
 */
import { apiFetch } from "./_fetcher";

export type PatronWallet = {
	id: string;
	address: string;
	chainId: number;
	isPrimary: boolean;
	linkedAt: string;
};

type ListWalletsResponse = { ok: true; wallets: PatronWallet[] };
type NonceResponse = { ok?: true; nonce: string; expiresInSeconds: number };
type BindResponse = { ok: true; address: string; chainId: number };

/**
 * GET /v2/auth/siwe/wallets: list every wallet bound to the current patron.
 *
 * Throws ApiError on non-2xx. Caller should surface 401 as "sign in first".
 */
export async function listWallets(): Promise<PatronWallet[]> {
	const res = await apiFetch<ListWalletsResponse>("/v2/auth/siwe/wallets");
	return res.wallets;
}

/**
 * POST /v2/auth/siwe/nonce: request a single-use nonce to embed in the
 * SIWE message before the user signs it. Nonce is tied to the patron's
 * session server-side and expires in ~10 minutes.
 */
export async function getNonce(address: string): Promise<NonceResponse> {
	return apiFetch<NonceResponse>("/v2/auth/siwe/nonce", {
		method: "POST",
		body: JSON.stringify({ address }),
	});
}

/**
 * POST /v2/auth/siwe/bind: submit a signed SIWE message. Backend verifies
 * the signature, consumes the nonce, then inserts (or upgrades) a row in
 * `patron_wallets` for the current patron.
 *
 * Pass `setPrimary: true` to mark this wallet as the patron's default for
 * future launches; backend will unset any previously-primary wallet.
 */
export async function bindWallet(input: {
	message: string;
	signature: string;
	setPrimary?: boolean;
}): Promise<BindResponse> {
	return apiFetch<BindResponse>("/v2/auth/siwe/bind", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

/**
 * DELETE /v2/auth/siwe/wallets/:address: unlink a wallet from the patron.
 *
 * Caller is responsible for confirming destructive intent. Agents owned by
 * the unlinked wallet become inaccessible until rebound.
 */
export async function unlinkWallet(address: string): Promise<void> {
	await apiFetch<unknown>(`/v2/auth/siwe/wallets/${encodeURIComponent(address)}`, {
		method: "DELETE",
	});
}

/**
 * POST /v2/auth/siwe/wallets/:address/primary: promote `address` to be the
 * patron's primary wallet (used by default for new launches).
 */
export async function setPrimaryWallet(address: string): Promise<void> {
	await apiFetch<unknown>(`/v2/auth/siwe/wallets/${encodeURIComponent(address)}/primary`, {
		method: "POST",
	});
}
