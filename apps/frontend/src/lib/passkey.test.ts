import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	loginWithPasskey,
	preparePasskeyLoginOptions,
	preparePasskeyRegistrationOptions,
	registerPasskey,
} from "./passkey";

vi.mock("@simplewebauthn/browser", async () => {
	const actual = await vi.importActual<typeof import("@simplewebauthn/browser")>("@simplewebauthn/browser");
	return {
		...actual,
		startAuthentication: vi.fn(),
		startRegistration: vi.fn(),
	};
});

const requestOptions = {
	challenge: "login-challenge",
	rpId: "waifu.fun",
	allowCredentials: [{ id: "credential-id", type: "public-key", transports: ["internal"] }],
	userVerification: "preferred",
} as PublicKeyCredentialRequestOptionsJSON;

const creationOptions = {
	challenge: "register-challenge",
	rp: { id: "waifu.fun", name: "waifu.fun" },
	user: { id: "user-id", name: "shadow@example.com", displayName: "shadow@example.com" },
	pubKeyCredParams: [{ alg: -7, type: "public-key" }],
	excludeCredentials: [],
} as PublicKeyCredentialCreationOptionsJSON;

describe("passkey platform hints", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("window", { PublicKeyCredential: vi.fn(), location: { assign: vi.fn() } });
		vi.stubGlobal("performance", { now: vi.fn(() => 1000) });
	});

	it("adds client-device to login options before WebAuthn", () => {
		expect(preparePasskeyLoginOptions(requestOptions)).toMatchObject({
			hints: ["client-device"],
		});
	});

	it("adds platform registration defaults before WebAuthn", () => {
		expect(preparePasskeyRegistrationOptions(creationOptions)).toMatchObject({
			hints: ["client-device"],
			authenticatorSelection: {
				authenticatorAttachment: "platform",
				residentKey: "preferred",
				userVerification: "preferred",
			},
		});
	});

	it("requests and ships platform-local login options", async () => {
		vi.mocked(startAuthentication).mockResolvedValue({ id: "assertion-id" } as Awaited<
			ReturnType<typeof startAuthentication>
		>);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, challengeId: "login-challenge-id", ...requestOptions }),
				})
				.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, token: "session-token" }) })
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: { return_to: "/patron" } }),
				}),
		);

		await expect(loginWithPasskey("shadow@example.com", "/patron")).resolves.toBe("/patron");

		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"https://eliza.steward.fi/auth/passkey/login/options",
			expect.objectContaining({
				body: expect.stringContaining('"authenticatorAttachment":"platform"'),
			}),
		);
		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"https://eliza.steward.fi/auth/passkey/login/options",
			expect.objectContaining({ body: expect.stringContaining('"hints":["client-device"]') }),
		);
		expect(startAuthentication).toHaveBeenCalledWith({
			optionsJSON: expect.objectContaining({ hints: ["client-device"] }),
		});
	});

	it("requests and ships platform-local registration options", async () => {
		vi.mocked(startRegistration).mockResolvedValue({ id: "attestation-id" } as Awaited<
			ReturnType<typeof startRegistration>
		>);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, ...creationOptions }) })
				.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, token: "session-token" }) })
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: { return_to: "/patron" } }),
				}),
		);

		await expect(registerPasskey("shadow@example.com", "/patron")).resolves.toBe("/patron");

		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"https://eliza.steward.fi/auth/passkey/register/options",
			expect.objectContaining({
				body: expect.stringContaining('"authenticatorAttachment":"platform"'),
			}),
		);
		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"https://eliza.steward.fi/auth/passkey/register/options",
			expect.objectContaining({ body: expect.stringContaining('"hints":["client-device"]') }),
		);
		expect(startRegistration).toHaveBeenCalledWith({
			optionsJSON: expect.objectContaining({
				hints: ["client-device"],
				authenticatorSelection: expect.objectContaining({ authenticatorAttachment: "platform" }),
			}),
		});
	});
});
