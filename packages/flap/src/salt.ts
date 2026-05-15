import { randomBytes } from "node:crypto";

import { type Address, type Hex, getContractAddress, keccak256, toBytes, toHex } from "viem";

import { getFlapPortalAddress } from "./client.js";
import { resolveFlapNetwork } from "./constants.js";
import { FLAP_TOKEN_VERSIONS, type FindFlapVanitySaltInput, type FindFlapVanitySaltResult } from "./types.js";

export const getFlapTokenImplementationAddress = (input: {
	taxRate: number;
	mktBps?: number;
	tokenVersion?: number;
	chainId?: number;
	network?: string;
}): Address => {
	const network = resolveFlapNetwork({
		chainId: input.chainId,
		network: input.network as "bsc" | "bscTestnet" | undefined,
	});

	if (input.taxRate <= 0) {
		return network.standardTokenImplementation;
	}

	if (input.tokenVersion === FLAP_TOKEN_VERSIONS.TOKEN_TAXED_V3) {
		if (!("taxTokenV3Implementation" in network) || !network.taxTokenV3Implementation) {
			throw new Error(`TOKEN_TAXED_V3 implementation is not configured for ${network.key}`);
		}
		return network.taxTokenV3Implementation;
	}

	if ((input.mktBps ?? 10_000) === 10_000) {
		return network.taxTokenV1Implementation;
	}

	return network.taxTokenV2Implementation;
};

export const getFlapVanitySuffix = (input: {
	taxRate: number;
	chainId?: number;
	network?: string;
}) => {
	const network = resolveFlapNetwork({
		chainId: input.chainId,
		network: input.network as "bsc" | "bscTestnet" | undefined,
	});

	return input.taxRate > 0 ? network.taxVanitySuffix : network.standardVanitySuffix;
};

export const getFlapMinimalProxyBytecode = (tokenImplementation: Address): Hex =>
	`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${tokenImplementation
		.slice(2)
		.toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex;

export const predictFlapTokenAddress = (input: {
	salt: Hex;
	tokenImplementation: Address;
	portalAddress: Address;
}): Address =>
	getContractAddress({
		from: input.portalAddress,
		salt: toBytes(input.salt),
		bytecode: getFlapMinimalProxyBytecode(input.tokenImplementation),
		opcode: "CREATE2",
	});

const nextSalt = (salt: Hex): Hex => keccak256(salt);
const randomSaltSeed = (): Hex => toHex(randomBytes(32));
const yieldToEventLoop = async () => new Promise<void>((resolve) => setImmediate(resolve));

export const findFlapVanitySalt = async (input: FindFlapVanitySaltInput): Promise<FindFlapVanitySaltResult> => {
	const network = resolveFlapNetwork({
		chainId: input.chainId,
		network: input.network as "bsc" | "bscTestnet" | undefined,
	});
	const portalAddress = input.portalAddress ?? getFlapPortalAddress({ network: network.key });
	const tokenImplementation =
		input.tokenImplementation ??
		getFlapTokenImplementationAddress({
			taxRate: input.taxRate,
			mktBps: input.mktBps,
			tokenVersion: input.tokenVersion,
			network: network.key,
		});
	const suffix = (input.suffix ?? getFlapVanitySuffix(input)).toLowerCase();
	const yieldEvery = Math.max(1, input.yieldEvery ?? 20_000);

	if (suffix.length !== 4) {
		throw new Error(`Expected a 4-character vanity suffix, received: ${suffix}`);
	}

	let iterations = 0;
	let salt = input.salt ?? keccak256(input.seed ?? randomSaltSeed());
	let predicted = predictFlapTokenAddress({
		salt,
		tokenImplementation,
		portalAddress,
	});

	while (!predicted.toLowerCase().endsWith(suffix)) {
		iterations += 1;
		salt = nextSalt(salt);
		predicted = predictFlapTokenAddress({
			salt,
			tokenImplementation,
			portalAddress,
		});

		if (iterations % yieldEvery === 0) {
			input.onProgress?.(iterations, salt);
			await yieldToEventLoop();
		}
	}

	return {
		salt,
		address: predicted,
		suffix,
		iterations,
		tokenImplementation,
		portalAddress,
	};
};
