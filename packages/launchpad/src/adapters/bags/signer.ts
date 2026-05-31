/**
 * Default Solana launch-wallet signer for the Bags executor.
 *
 * Builds a `SolanaSigner` from a base58- or JSON-array-encoded secret key,
 * using `@solana/web3.js` to deserialize the Bags-returned versioned
 * transactions, add the wallet's signature, and re-serialize to base58.
 *
 * The secret comes from `BAGS_LAUNCH_SIGNER_SECRET` (or
 * `SOLANA_LAUNCH_SIGNER_SECRET`). It is the per-agent launch wallet's key,
 * managed the same way the BSC path manages its Steward EOA. Treat it as a
 * secret; never log it. In production this should be backed by Steward's
 * Solana wallet custody rather than a raw env secret (see the go-live
 * checklist + the integration note for Shaw's provisioning pipeline).
 */

import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

import type { SolanaSigner } from "./executor.js";

/** Decode a secret key from base58 or a JSON byte array. */
export function decodeSolanaSecret(secret: string): Uint8Array {
	const trimmed = secret.trim();
	if (trimmed.startsWith("[")) {
		const arr = JSON.parse(trimmed) as number[];
		return Uint8Array.from(arr);
	}
	return bs58.decode(trimmed);
}

/**
 * Build a keypair-backed `SolanaSigner` from a secret key string. Co-signs the
 * Bags-returned versioned transactions (which are already partially signed with
 * the token mint) by adding the launch wallet's signature.
 */
export function keypairSignerFromSecret(secret: string): SolanaSigner {
	const keypair = Keypair.fromSecretKey(decodeSolanaSecret(secret));
	return {
		publicKey: keypair.publicKey.toBase58(),
		async signTransactions(base58Txs: string[]): Promise<string[]> {
			return base58Txs.map((b58) => {
				const raw = bs58.decode(b58);
				const tx = VersionedTransaction.deserialize(raw);
				tx.sign([keypair]);
				return bs58.encode(tx.serialize());
			});
		},
	};
}

/**
 * Resolve a `SolanaSigner` from the environment, or null if no secret is set.
 * Used by the API route to construct a real executor only when configured.
 */
export function envSolanaSigner(): SolanaSigner | null {
	const secret = process.env.BAGS_LAUNCH_SIGNER_SECRET ?? process.env.SOLANA_LAUNCH_SIGNER_SECRET;
	if (!secret) return null;
	return keypairSignerFromSecret(secret);
}
