import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { getAddress } from "viem";
import type {
	ControlPlaneChain,
	ControlPlaneTokenKey,
	ControlPlaneTokenKeyInput,
	ControlPlaneWalletKey,
	ControlPlaneWalletKeyInput,
} from "./types.js";

function requireNonEmpty(value: string, field: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${field} is required`);
	}

	return trimmed;
}

function normalizeAddress(chain: ControlPlaneChain, address: string): { address: string; normalizedAddress: string } {
	const trimmed = requireNonEmpty(address, "address");

	if (chain === "evm") {
		const checksummedAddress = getAddress(trimmed);
		return {
			address: checksummedAddress,
			normalizedAddress: checksummedAddress.toLowerCase(),
		};
	}

	const canonicalAddress = new PublicKey(trimmed).toBase58();
	return {
		address: canonicalAddress,
		normalizedAddress: canonicalAddress,
	};
}

export function normalizeControlPlaneWalletKey(input: ControlPlaneWalletKeyInput): ControlPlaneWalletKey {
	if (!Number.isFinite(input.chainId) || input.chainId <= 0) {
		throw new Error("chainId must be a positive number");
	}

	const normalized = normalizeAddress(input.chain, input.address);
	return {
		chain: input.chain,
		chainId: input.chainId,
		address: normalized.address,
		normalizedAddress: normalized.normalizedAddress,
	};
}

export function normalizeControlPlaneTokenKey(input: ControlPlaneTokenKeyInput): ControlPlaneTokenKey {
	if (!Number.isFinite(input.chainId) || input.chainId <= 0) {
		throw new Error("chainId must be a positive number");
	}

	const normalized = normalizeAddress(input.chain, input.contractAddress);
	return {
		chain: input.chain,
		chainId: input.chainId,
		contractAddress: normalized.address,
		normalizedContractAddress: normalized.normalizedAddress,
	};
}

export function normalizeControlPlaneInviteCode(code: string): string {
	return requireNonEmpty(code, "invite code").toUpperCase();
}

export function createControlPlaneInviteCode(prefix = "WAIFU"): string {
	const normalizedPrefix = requireNonEmpty(prefix, "invite prefix")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");
	return `${normalizedPrefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
