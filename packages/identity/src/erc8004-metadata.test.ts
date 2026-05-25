import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	BSC_MAINNET_ERC8004_REGISTRY,
	SOL_AGENT_SAFE_ADDRESS,
	SOL_ELIZA_RUNTIME_ENDPOINT,
	SOL_STEWARD_TRADING_WALLET,
	SOL_TOKEN_ADDRESS,
	buildErc8004RegistrationFile,
	buildSolErc8004RegistrationFile,
	validateErc8004RegistrationFile,
} from "./erc8004-metadata.js";

describe("ERC-8004 metadata renderer", () => {
	it("renders Sol as valid registration JSON", () => {
		const file = buildSolErc8004RegistrationFile();
		validateErc8004RegistrationFile(file);
		assert.equal(file.name, "Sol");
		assert.equal(file.waifu.tokenAddress, SOL_TOKEN_ADDRESS);
		assert.equal(file.waifu.agentSafeAddress, SOL_AGENT_SAFE_ADDRESS);
		assert.equal(file.waifu.stewardWallet, SOL_STEWARD_TRADING_WALLET);
		assert.equal(file.registrations[0]?.chainId, 56);
		assert.equal(file.registrations[0]?.registry, BSC_MAINNET_ERC8004_REGISTRY);
		assert.ok(
			file.services.some((service) => service.type === "a2a" && service.endpoint === SOL_ELIZA_RUNTIME_ENDPOINT),
		);
	});

	it("throws when required fields are missing", () => {
		assert.throws(
			() =>
				buildErc8004RegistrationFile({
					agent: { address: SOL_TOKEN_ADDRESS, name: "", bio: "desc" },
					image: "https://waifu.fun/agent.png",
				}),
			/name is required/,
		);
	});

	it("validates service array shape", () => {
		const file = buildSolErc8004RegistrationFile();
		assert.throws(
			() => validateErc8004RegistrationFile({ ...file, services: { type: "a2a" } }),
			/services must be an array/,
		);
		assert.throws(
			() => validateErc8004RegistrationFile({ ...file, services: [{ endpoint: "https://example.com" }] }),
			/type is required/,
		);
	});

	it("accepts http, https, ipfs, and data JSON image URIs", () => {
		for (const image of [
			"http://localhost/avatar.png",
			"https://waifu.fun/avatar.png",
			"ipfs://bafybeigdyrzt5sfp7udm7hu76v2r4h2t6b77s64z5m2r4examplecid",
			"data:application/json;base64,eyJpbWFnZSI6Im9rIn0=",
		]) {
			assert.doesNotThrow(() => buildSolErc8004RegistrationFile({ image }));
		}
		assert.throws(() => buildSolErc8004RegistrationFile({ image: "ftp://example.com/avatar.png" }), /image must be/);
	});

	it("requires at least one registration entry", () => {
		const file = buildSolErc8004RegistrationFile();
		assert.throws(() => validateErc8004RegistrationFile({ ...file, registrations: [] }), /at least one registration/);
	});
});
