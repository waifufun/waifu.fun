import { type getDatabase, patronWallets } from "@waifufun/db";
import { and, eq } from "drizzle-orm";

import type { StewardAuthPrincipal } from "../middleware/steward-auth.js";

type DbHandle = ReturnType<typeof getDatabase>["db"];

export type WalletChain = "evm" | "solana";

export type PatronPrimaryWallet = {
	chain: WalletChain;
	address: string;
};

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function normalizeWalletChain(value: unknown): WalletChain | null {
	if (typeof value !== "string") return null;
	const lower = value.toLowerCase();
	if (lower === "evm" || lower === "ethereum" || lower === "eip155") return "evm";
	if (lower === "solana" || lower === "sol") return "solana";
	return null;
}

export function chainFromAuthMethod(value: unknown): WalletChain | null {
	if (typeof value !== "string") return null;
	const lower = value.toLowerCase();
	if (lower.includes("solana") || lower.includes("siws")) return "solana";
	if (lower.includes("evm") || lower.includes("ethereum") || lower.includes("siwe")) return "evm";
	return null;
}

export function normalizeWalletAddress(chain: WalletChain, value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (chain === "evm") return EVM_ADDRESS_RE.test(trimmed) ? trimmed : null;
	return SOLANA_ADDRESS_RE.test(trimmed) ? trimmed : null;
}

function inferWalletFromAddress(value: unknown, preferredChain?: WalletChain | null): PatronPrimaryWallet | null {
	if (preferredChain) {
		const address = normalizeWalletAddress(preferredChain, value);
		if (address) return { chain: preferredChain, address };
	}
	const evm = normalizeWalletAddress("evm", value);
	if (evm) return { chain: "evm", address: evm };
	const solana = normalizeWalletAddress("solana", value);
	if (solana) return { chain: "solana", address: solana };
	return null;
}

export function pickPrimaryWallet(
	principal: StewardAuthPrincipal,
	preferredChain?: WalletChain | null,
): PatronPrimaryWallet | null {
	const authMethodChain = chainFromAuthMethod(principal.authMethod);
	const walletChain = preferredChain ?? authMethodChain;
	const wallets = (principal.wallets ?? [])
		.map((wallet) => {
			const chain = normalizeWalletChain(wallet.chainNamespace);
			if (!chain) return null;
			const address = normalizeWalletAddress(chain, wallet.address);
			return address ? { chain, address } : null;
		})
		.filter((wallet): wallet is PatronPrimaryWallet => wallet !== null);

	// Two cases:
	//   1. preferredChain explicitly requested by caller (UI passed primaryChain):
	//      strict. Return only a wallet on that chain, or null. Never
	//      cross-fall back to a different chain because the user explicitly
	//      signed in with one specific wallet kind.
	//   2. No explicit request; walletChain inferred from auth_method or null:
	//      best-effort. Try the implied chain first, then fall back to any
	//      wallet, then to principal.address.
	if (preferredChain) {
		const preferred = wallets.find((item) => item.chain === preferredChain);
		if (preferred) return preferred;
		const directOnPreferred = inferWalletFromAddress(principal.address, preferredChain);
		if (directOnPreferred && directOnPreferred.chain === preferredChain) {
			return directOnPreferred;
		}
		return null;
	}
	if (walletChain) {
		const preferred = wallets.find((item) => item.chain === walletChain);
		if (preferred) return preferred;
		const directOnPreferred = inferWalletFromAddress(principal.address, walletChain);
		if (directOnPreferred && directOnPreferred.chain === walletChain) return directOnPreferred;
	}
	if (wallets.length > 0) return wallets[0]!;
	return inferWalletFromAddress(principal.address, walletChain);
}

export async function ensurePrimaryPatronWallet(
	db: DbHandle,
	patronId: string,
	wallet: PatronPrimaryWallet,
): Promise<void> {
	const now = new Date();
	const storedAddress = wallet.chain === "evm" ? wallet.address.toLowerCase() : wallet.address;
	const existing = await db.select().from(patronWallets).where(eq(patronWallets.address, storedAddress)).limit(1);
	if (existing[0] && existing[0].patronId !== patronId) return;

	await db.update(patronWallets).set({ isPrimary: false }).where(eq(patronWallets.patronId, patronId));

	const chainId = wallet.chain === "evm" ? 56 : 0;
	if (existing[0]) {
		await db
			.update(patronWallets)
			.set({
				chainId,
				chainNamespace: wallet.chain,
				kind: "steward_primary",
				isPrimary: true,
				lastUsedAt: now,
			})
			.where(and(eq(patronWallets.patronId, patronId), eq(patronWallets.address, storedAddress)));
		return;
	}

	await db
		.insert(patronWallets)
		.values({
			patronId,
			address: storedAddress,
			chainId,
			chainNamespace: wallet.chain,
			kind: "steward_primary",
			isPrimary: true,
			lastUsedAt: now,
		})
		.returning();
}
