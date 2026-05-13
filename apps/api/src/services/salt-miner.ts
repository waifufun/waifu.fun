import { randomBytes } from "node:crypto";

import { schema } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { eq } from "drizzle-orm";
import {
	type Address,
	type Hex,
	concatHex,
	getContractAddress,
	isAddress,
	keccak256,
	numberToHex,
	padHex,
	toHex,
} from "viem";

export const FLAP_PORTAL_ADDRESS = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0" as const;
// Portal.newTokenV6 clones TOKEN_TAXED_V3. TOKEN_TAXED V1 (0x29e6...32aA8)
// is only for Portal.newTokenV2 and must not be used for Wave H salt mining.
export const TOKEN_IMPL_TAXED_V3 = "0x024f18294970B5c76c0691b87f138A0317156422" as const;
export const VANITY_SUFFIX = "7777";

export interface MineSaltInput {
	deployer?: Address;
	implementation?: Address;
	suffix?: string;
	maxIterations?: number;
	seed?: Hex;
}

export interface MineSaltResult {
	salt: Hex;
	predictedTokenAddress: Address;
	iterations: number;
}

export interface QueueSaltMiningInput extends MineSaltInput {
	db: Database;
	launchId: string;
}

const queuedLaunches = new Set<string>();

export function cloneInitCode(implementation: Address = TOKEN_IMPL_TAXED_V3): Hex {
	if (!isAddress(implementation)) throw new Error("implementation must be an EVM address");
	return concatHex([
		"0x3d602d80600a3d3981f3",
		"0x363d3d373d3d3d363d73",
		implementation.toLowerCase() as Hex,
		"0x5af43d82803e903d91602b57fd5bf3",
	]);
}

export function predictFlapTokenAddress(input: { salt: Hex; deployer?: Address; implementation?: Address }): Address {
	return getContractAddress({
		bytecode: cloneInitCode(input.implementation ?? TOKEN_IMPL_TAXED_V3),
		from: input.deployer ?? FLAP_PORTAL_ADDRESS,
		opcode: "CREATE2",
		salt: input.salt,
	}).toLowerCase() as Address;
}

export function mineVanitySalt(input: MineSaltInput = {}): MineSaltResult {
	const suffix = (input.suffix ?? VANITY_SUFFIX).toLowerCase();
	const maxIterations = input.maxIterations ?? 250_000;
	const seed = input.seed ?? toHex(randomBytes(32));
	let salt = padHex(seed, { size: 32 });

	for (let i = 0; i < maxIterations; i++) {
		const predictInput: { salt: Hex; deployer?: Address; implementation?: Address } = { salt };
		if (input.deployer) predictInput.deployer = input.deployer;
		if (input.implementation) predictInput.implementation = input.implementation;
		const predictedTokenAddress = predictFlapTokenAddress(predictInput);
		if (predictedTokenAddress.toLowerCase().endsWith(suffix)) {
			return { salt, predictedTokenAddress, iterations: i + 1 };
		}
		salt = keccak256(concatHex([salt, numberToHex(i, { size: 8 })]));
	}

	throw new Error(`vanity salt mining exhausted ${maxIterations} iterations without suffix ${suffix}`);
}

export function queueSaltMining(input: QueueSaltMiningInput): void {
	if (queuedLaunches.has(input.launchId)) return;
	queuedLaunches.add(input.launchId);
	setTimeout(() => {
		void runSaltMiningJob(input)
			.catch(() => {
				// Failure state is already persisted inside runSaltMiningJob.
			})
			.finally(() => queuedLaunches.delete(input.launchId));
	}, 0);
}

export async function runSaltMiningJob(input: QueueSaltMiningInput): Promise<MineSaltResult> {
	try {
		const result = mineVanitySalt(input);
		await input.db
			.update(schema.agentLaunches)
			.set({
				predictedTokenAddress: result.predictedTokenAddress,
				vanitySalt: result.salt,
				updatedAt: new Date(),
			})
			.where(eq(schema.agentLaunches.id, input.launchId));
		return result;
	} catch (error) {
		await input.db
			.update(schema.agentLaunches)
			.set({
				state: "mining_failed",
				bundleStatus: "failed_terminal",
				bundleFailureReason: error instanceof Error ? error.message : String(error),
				updatedAt: new Date(),
			})
			.where(eq(schema.agentLaunches.id, input.launchId));
		throw error;
	}
}
