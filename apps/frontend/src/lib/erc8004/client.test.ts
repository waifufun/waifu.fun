/**
 * Tests for the ERC-8004 fetcher + URL builders.
 *
 * Vitest runs in node env (no jsdom), so we exercise the pure helpers
 * and the type guard, not the React side. The fetcher's network path
 * is exercised separately through the mock-fallback branch using the
 * Sol address.
 */
import { describe, expect, it } from "vitest";

import {
	build8004ScanUrl,
	buildScanAddressUrl,
	buildScanTxUrl,
	ipfsToGateway,
	isErc8004IdentityRecord,
} from "./client";
import type { Erc8004IdentityRecord } from "./types";

const FIXTURE: Erc8004IdentityRecord = {
	standard: "erc-8004",
	chain: "bsc",
	chainId: 56,
	registryAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
	tokenId: "1",
	agentURI: "ipfs://bafy...",
	metadataHttpsUrl: "https://api.waifu.fun/v2/agents/sol/erc8004.json",
	metadataIpfsUri: "ipfs://bafy...",
	ownerWalletAddress: "0xCF3104986C4ef45326A918A9F7F80DE57953Fc21",
	txHash: "0xabc",
	blockNumber: null,
	registeredAt: "2026-05-24T06:00:00.000Z",
};

describe("isErc8004IdentityRecord", () => {
	it("accepts a well-formed record", () => {
		expect(isErc8004IdentityRecord(FIXTURE)).toBe(true);
	});

	it("rejects null/undefined/non-objects", () => {
		expect(isErc8004IdentityRecord(null)).toBe(false);
		expect(isErc8004IdentityRecord(undefined)).toBe(false);
		expect(isErc8004IdentityRecord("erc-8004")).toBe(false);
		expect(isErc8004IdentityRecord(42)).toBe(false);
	});

	it("rejects records missing required fields", () => {
		const { tokenId, ...partial } = FIXTURE;
		void tokenId;
		expect(isErc8004IdentityRecord(partial)).toBe(false);
	});

	it("rejects records with wrong standard label", () => {
		expect(isErc8004IdentityRecord({ ...FIXTURE, standard: "erc-8183" })).toBe(false);
	});

	it("accepts null blockNumber + null metadata mirrors", () => {
		expect(
			isErc8004IdentityRecord({
				...FIXTURE,
				blockNumber: null,
				metadataHttpsUrl: null,
				metadataIpfsUri: null,
			}),
		).toBe(true);
	});
});

describe("URL builders", () => {
	it("build8004ScanUrl produces the canonical agent path", () => {
		const url = build8004ScanUrl(FIXTURE);
		expect(url).toContain("8004scan.io");
		expect(url).toContain("/56/");
		expect(url).toContain(FIXTURE.registryAddress.toLowerCase());
		expect(url).toContain(`/${FIXTURE.tokenId}`);
	});

	it("buildScanTxUrl routes BSC mainnet to bscscan.com", () => {
		expect(buildScanTxUrl(FIXTURE)).toBe(`https://bscscan.com/tx/${FIXTURE.txHash}`);
	});

	it("buildScanTxUrl routes testnet (97) to testnet.bscscan.com", () => {
		expect(buildScanTxUrl({ ...FIXTURE, chainId: 97 })).toContain("testnet.bscscan.com");
	});

	it("buildScanAddressUrl uses the chain-appropriate host", () => {
		expect(buildScanAddressUrl(FIXTURE, "0xdead")).toBe("https://bscscan.com/address/0xdead");
		expect(buildScanAddressUrl({ ...FIXTURE, chainId: 1 }, "0xdead")).toContain("etherscan.io");
	});
});

describe("ipfsToGateway", () => {
	it("converts ipfs:// to a public gateway URL", () => {
		expect(ipfsToGateway("ipfs://bafy123")).toBe("https://ipfs.io/ipfs/bafy123");
	});

	it("passes https:// through unchanged", () => {
		expect(ipfsToGateway("https://waifu.fun/x.json")).toBe("https://waifu.fun/x.json");
	});

	it("returns null for null / non-ipfs / non-https inputs", () => {
		expect(ipfsToGateway(null)).toBeNull();
		expect(ipfsToGateway("arweave://abc")).toBeNull();
	});

	it("handles ipfs://ipfs/ legacy prefix", () => {
		expect(ipfsToGateway("ipfs://ipfs/bafy")).toBe("https://ipfs.io/ipfs/bafy");
	});
});
