import assert from "node:assert/strict";
import test from "node:test";

import { type ProvisionRequest, provisionPayloadToLaunchInput, validateProvisionRequest } from "./payload-adapter.js";

const OWNER = "0x0000000000000000000000000000000000000001" as const;
const PLATFORM = "0x00000000000000000000000000000000000000aa" as const;
const CUSTOM_VAULT = "0x00000000000000000000000000000000000000bb" as const;

const config = {
	platformWallet: PLATFORM,
	fourMemePlatformBps: 2500,
	flapVaultPortalAddress: "0x00000000000000000000000000000000000000cc" as const,
	flapSplitVaultFactoryAddress: "0x00000000000000000000000000000000000000dd" as const,
};

const patron = { stewardUserId: "steward-user-1", primaryAddress: OWNER };
const slugify = (name: string) => `waifu-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function runtime(kind: "hosted" | "pull" | "webhook") {
	if (kind === "webhook") return { kind, webhookUrl: "https://example.com/hook", webhookSecret: "secret" };
	return { kind };
}

function basePayload(kind: "hosted" | "pull" | "webhook" = "webhook") {
	return {
		inviteCode: "W26TEST",
		persona: {
			name: "Test Waifu",
			ticker: "TEST",
			bio: "a test agent for provision",
			personaPrompt: "be useful",
			avatarTemplateId: "tessera",
			hasAvatarUpload: false,
		},
		runtime: runtime(kind),
		safe: {
			taxAgentBps: 8000,
			taxPatronBps: 2000,
			owners: [OWNER],
			threshold: 1,
			firstBuyFundingSource: null,
			adapters: [{ slug: "pancake", enabled: true }],
		},
	};
}

function taxLaunchpad(taxBps: 100 | 300 | 500 | 1000) {
	return {
		launchpad_id: "four-meme-tax",
		chain: "bsc",
		launchpad_config: {
			kind: "four-meme-tax",
			taxBps,
			platformCutBps: 2500,
			allocation: {
				founderBps: 3000,
				holderBps: 2000,
				burnBps: 1000,
				liquidityBps: 1500,
			},
			minHolderBalance: "100000",
		},
		fee_mode: "tax",
	};
}

function validate(payload: unknown) {
	return validateProvisionRequest(payload, patron, config, slugify, "https://example.com/avatar.png");
}

test("provision adapter maps four.meme tax fee variants and custom allocation", () => {
	for (const taxBps of [100, 300, 500, 1000] as const) {
		const result = validate({ ...basePayload("webhook"), launchpad: taxLaunchpad(taxBps) });
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.deepEqual(result.launchInput.tax, {
			feeRate: taxBps / 100,
			burnRate: 10,
			divideRate: 20,
			liquidityRate: 15,
			recipientRate: 55,
			minSharing: 100000,
		});
		assert.equal(result.launchInput.launchpad?.id, "four-meme-tax");
		assert.deepEqual(result.launchInput.taxSplit, {
			agentBps: 4364,
			patronBps: 1091,
			platformBps: 4545,
			platformAddress: PLATFORM,
			patronAddress: OWNER,
		});
	}
});

test("provision request validation accepts explicit null launchpad as default", () => {
	const result = validate({ ...basePayload("webhook"), launchpad: null });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.launchInput.launchpad, undefined);
	assert.equal(result.launchInput.tax, undefined);
});

test("provision request validation requires an invite code", () => {
	const result = validate({ ...basePayload("hosted"), inviteCode: " " });
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.message, "inviteCode is required");
});

test("provision adapter maps hosted runtime metadata without webhook credentials", () => {
	const result = validate({ ...basePayload("hosted"), launchpad: null });
	assert.equal(result.ok, true);
	if (!result.ok) return;

	const persona = result.launchInput.persona as Record<string, unknown>;
	assert.equal(persona.runtimeKind, "hosted");
	assert.equal(persona.webhookUrl, null);
	assert.equal(persona.runtimeWebhookSecretHash, null);
	assert.equal(result.pullRuntime, false);
});

test("provision request validation rejects platform cut bypasses", () => {
	const zeroCutPayload = { ...basePayload("webhook"), launchpad: taxLaunchpad(300) };
	zeroCutPayload.launchpad.launchpad_config.platformCutBps = 0;
	zeroCutPayload.launchpad.launchpad_config.allocation = {
		founderBps: 5500,
		holderBps: 2000,
		burnBps: 1000,
		liquidityBps: 1500,
	};
	const zeroCutResult = validate(zeroCutPayload);
	assert.equal(zeroCutResult.ok, false);

	const noWalletResult = validateProvisionRequest(
		{ ...basePayload("webhook"), launchpad: taxLaunchpad(300) },
		patron,
		{ ...config, platformWallet: null },
		slugify,
		"https://example.com/avatar.png",
	);
	assert.equal(noWalletResult.ok, false);
});

test("provision request validation handles minHolderBalance compatibility", () => {
	const zeroPayload = { ...basePayload("webhook"), launchpad: taxLaunchpad(300) };
	zeroPayload.launchpad.launchpad_config.minHolderBalance = "0";
	const zeroResult = validate(zeroPayload);
	assert.equal(zeroResult.ok, false);
	if (zeroResult.ok) return;
	assert.equal(zeroResult.message, "launchpad config is invalid");

	const defaultPayload = { ...basePayload("webhook"), launchpad: taxLaunchpad(300) };
	defaultPayload.launchpad.launchpad_config.minHolderBalance = "10000";
	const defaultResult = validate(defaultPayload);
	assert.equal(defaultResult.ok, true);
	if (!defaultResult.ok) return;
	assert.equal(defaultResult.launchInput.tax?.minSharing, 100000);
});

test("provision adapter maps four.meme regular without tax for each runtime kind", () => {
	for (const kind of ["hosted", "pull", "webhook"] as const) {
		const result = validate({
			...basePayload(kind),
			launchpad: {
				launchpad_id: "four-meme-regular",
				chain: "bsc",
				launchpad_config: { kind: "four-meme-regular" },
				fee_mode: "regular",
			},
		});
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.equal(result.launchInput.tax, undefined);
		assert.equal(result.launchInput.launchpad?.id, "four-meme-regular");
		assert.equal(result.pullRuntime, kind === "pull");
	}
});

test("provision adapter maps typed flap agent-treasury and custom-vault input for pull and webhook runtimes", () => {
	for (const kind of ["pull", "webhook"] as const) {
		for (const recipient of ["agent-treasury", "custom-vault"] as const) {
			const raw = basePayload(kind);
			const payload: ProvisionRequest = {
				inviteCode: raw.inviteCode,
				persona: raw.persona,
				runtime:
					kind === "webhook" ? { kind, webhookUrl: "https://example.com/hook", webhookSecret: "secret" } : { kind },
				safe: { ...raw.safe, owners: [OWNER] },
				launchpad: {
					launchpad_id: "flap",
					chain: "bsc",
					launchpad_config: {
						kind: "flap",
						taxBps: 300,
						platformCutBps: 2500,
						recipient,
						...(recipient === "custom-vault" ? { customVaultAddress: CUSTOM_VAULT } : {}),
					},
					fee_mode: "tax",
				},
			};
			const input = provisionPayloadToLaunchInput(payload, patron, config, slugify, "https://example.com/avatar.png");
			assert.equal(input.tax, undefined);
			assert.equal(input.launchpad?.id, "flap");
			const launchpad = input.launchpad;
			assert.equal(launchpad?.id, "flap");
			if (launchpad?.id !== "flap") return;
			assert.equal(launchpad.platformWalletAddress, PLATFORM);
			assert.equal(launchpad.flapVaultPortalAddress, config.flapVaultPortalAddress);
			assert.equal(launchpad.flapSplitVaultFactoryAddress, config.flapSplitVaultFactoryAddress);
			assert.equal(launchpad.feeConfig.recipient, recipient);
		}
	}
});

test("provision request validation rejects flap until the provision launcher is adapter-aware", () => {
	const result = validate({
		...basePayload("pull"),
		launchpad: {
			launchpad_id: "flap",
			chain: "bsc",
			launchpad_config: { kind: "flap", taxBps: 300, platformCutBps: 2500, recipient: "agent-treasury" },
			fee_mode: "tax",
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.code, "LAUNCHPAD_NOT_SUPPORTED");
});
