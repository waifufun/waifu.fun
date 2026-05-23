import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CreateLaunchRequest, createLaunch } from "./launches";

/**
 * Wave M wizard payload tests.
 *
 * These tests assert that `createLaunch()` includes the Wave M LaunchConfig
 * fields (`platformReceiver`, `patron`, `platformBps`, `patronBps`,
 * `agentSafeOwners`, `agentSafeThreshold`) in the `POST /v2/launches` body
 * whenever the caller passes `patronPlatform`. They also assert that the
 * response handler tolerates both `token` (the v2 route shape) and the
 * legacy `tokenAddress` key.
 */

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function basePayload(overrides: Partial<CreateLaunchRequest> = {}): CreateLaunchRequest {
	return {
		inviteCode: "WF-TEST1-TEST2",
		persona: {
			name: "Mika",
			ticker: "MIKA",
			bio: "A market-native waifu.",
			personaPrompt: null,
			avatarTemplateId: "tessera",
			hasAvatarUpload: false,
		},
		tier: 80,
		runtime: { kind: "hosted" },
		launchAuthorization: {
			creator: "0x1111111111111111111111111111111111111111",
			siwe: { message: "siwe", signature: "0xsig" },
		},
		...overrides,
	};
}

function patronPlatformDefaults(creator: string): NonNullable<CreateLaunchRequest["patronPlatform"]> {
	return {
		platformReceiver: "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
		patron: creator,
		platformBps: 1000,
		patronBps: 2500,
		agentSafeOwners: [creator],
		agentSafeThreshold: 1,
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
});

describe("createLaunch Wave M payload assembly", () => {
	it("includes platformReceiver, patron, bps splits, and safe config in POST body", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "abc", token: "0xtoken" }));
		globalThis.fetch = fetchSpy as never;

		const creator = "0x1111111111111111111111111111111111111111";
		const payload = basePayload({ patronPlatform: patronPlatformDefaults(creator) });
		const result = await createLaunch(payload);

		expect(result.ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const body = JSON.parse(init.body as string) as Record<string, unknown>;

		expect(body.platformReceiver).toBe("0xC9846a839c4e1D9050Dc890A25661AB13224e9EC");
		expect(body.patron).toBe(creator);
		expect(body.platformBps).toBe(1000);
		expect(body.patronBps).toBe(2500);
		expect(body.agentSafeOwners).toEqual([creator]);
		expect(body.agentSafeThreshold).toBe(1);
		expect(body.creator).toBe(creator);
		expect(body.tier).toBe("80");
	});

	it("sends uploaded Flap metadata instead of the create-placeholder URI", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "abc", token: "0xtoken" }));
		globalThis.fetch = fetchSpy as never;

		await createLaunch(
			basePayload({
				flap: {
					metaCid: "bafkreigh2akiscaildc0123456789",
					metaUri: "ipfs://bafkreigh2akiscaildc0123456789",
				},
			}),
		);

		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.metadataURI).toBe("ipfs://bafkreigh2akiscaildc0123456789");
		expect(body.flapMetaCid).toBe("bafkreigh2akiscaildc0123456789");
	});

	it("derives an IPFS metadata URI when only the Flap CID is present", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "abc", token: "0xtoken" }));
		globalThis.fetch = fetchSpy as never;

		await createLaunch(
			basePayload({
				flap: {
					metaCid: "bafkreigh2akiscaildc0123456789",
					metaUri: null,
				},
			}),
		);

		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.metadataURI).toBe("ipfs://bafkreigh2akiscaildc0123456789");
		expect(body.flapMetaCid).toBe("bafkreigh2akiscaildc0123456789");
	});

	it("keeps the placeholder metadata URI when no Flap upload exists", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "abc", token: "0xtoken" }));
		globalThis.fetch = fetchSpy as never;

		await createLaunch(basePayload());

		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.metadataURI).toBe("waifu://create/WF-TEST1-TEST2");
		expect("flapMetaCid" in body).toBe(false);
	});

	it("omits agentSafeOwners when caller provides empty owner list", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "abc", token: "0xtoken" }));
		globalThis.fetch = fetchSpy as never;

		const creator = "0x2222222222222222222222222222222222222222";
		const payload = basePayload({
			patronPlatform: { ...patronPlatformDefaults(creator), agentSafeOwners: [] },
		});
		await createLaunch(payload);

		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect("agentSafeOwners" in body).toBe(false);
		expect(body.agentSafeThreshold).toBe(1);
	});

	it("does not include Wave M fields when patronPlatform is absent", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ id: "abc", token: "0xtoken" }));
		globalThis.fetch = fetchSpy as never;

		await createLaunch(basePayload());

		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		for (const key of [
			"platformReceiver",
			"patron",
			"platformBps",
			"patronBps",
			"agentSafeOwners",
			"agentSafeThreshold",
		]) {
			expect(key in body).toBe(false);
		}
	});

	it("reads tokenAddress from `token` field in response (v2 shape)", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(jsonResponse({ id: "launch-1", token: "0xfeedfacefeedfacefeedfacefeedfacefeedface" }));
		globalThis.fetch = fetchSpy as never;

		const result = await createLaunch(basePayload());
		expect(result).toMatchObject({
			ok: true,
			id: "launch-1",
			tokenAddress: "0xfeedfacefeedfacefeedfacefeedfacefeedface",
		});
	});

	it("falls back to legacy tokenAddress field when `token` is missing", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(jsonResponse({ id: "launch-2", tokenAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }));
		globalThis.fetch = fetchSpy as never;

		const result = await createLaunch(basePayload());
		expect(result).toMatchObject({
			ok: true,
			id: "launch-2",
			tokenAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		});
	});
});
