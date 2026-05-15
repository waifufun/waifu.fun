import assert from "node:assert/strict";
import test from "node:test";

import { getContractAddress, keccak256 } from "viem";

import {
	FLAP_PORTAL_ADDRESS,
	TOKEN_IMPL_TAXED_V3,
	cloneInitCode,
	mineVanitySalt,
	predictFlapTokenAddress,
} from "./salt-miner.js";

test("predictFlapTokenAddress matches Portal.newTokenV6 CREATE2 derivation", () => {
	const salt = "0x0000000000000000000000000000000000000000000000000000000000000528" as const;
	const expected = getContractAddress({
		from: FLAP_PORTAL_ADDRESS,
		salt,
		bytecode: cloneInitCode(TOKEN_IMPL_TAXED_V3),
		opcode: "CREATE2",
	}).toLowerCase();

	assert.equal(TOKEN_IMPL_TAXED_V3, "0x024f18294970B5c76c0691b87f138A0317156422");
	assert.equal(
		keccak256(cloneInitCode(TOKEN_IMPL_TAXED_V3)),
		"0x2f7f413fcc6c3812c665c15bd4a012e663f567d626112a81d401066fd5a771b4",
	);
	assert.equal(expected, "0x9db6879aa34347b37b319e576c9be2e998605af3");
	assert.equal(predictFlapTokenAddress({ salt }), expected);
});

test("mineVanitySalt is deterministic for a fixed seed", () => {
	const first = mineVanitySalt({ seed: "0x01", suffix: "77", maxIterations: 100_000 });
	const second = mineVanitySalt({ seed: "0x01", suffix: "77", maxIterations: 100_000 });
	assert.deepEqual(second, first);
	assert.ok(first.predictedTokenAddress.endsWith("77"));
	assert.equal(predictFlapTokenAddress({ salt: first.salt }), first.predictedTokenAddress);
});
