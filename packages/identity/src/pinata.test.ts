import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidIpfsCid, pinRegistrationFile } from "./pinata.js";

describe("Pinata pinning", () => {
	it("returns an ipfs:// CID from Pinata", async () => {
		const uri = await pinRegistrationFile(
			{ hello: "erc8004" },
			{
				env: { PINATA_JWT: "test.jwt" } as NodeJS.ProcessEnv,
				fetchImpl: async () =>
					new Response(JSON.stringify({ IpfsHash: "bafybeigdyrzt5sfp7udm7hu76v2r4h2t6b77s64z5m2r4examplecid" }), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
			},
		);
		assert.equal(uri, "ipfs://bafybeigdyrzt5sfp7udm7hu76v2r4h2t6b77s64z5m2r4examplecid");
		assert.ok(isValidIpfsCid(uri.slice("ipfs://".length)));
	});
});
