import assert from "node:assert/strict";
import test from "node:test";

import { buildClaimLaunchAdminWallets } from "./claim.js";

test("buildClaimLaunchAdminWallets grants creator owner wallet admin access", () => {
	assert.deepEqual(buildClaimLaunchAdminWallets({ ownerAddress: "0x0000000000000000000000000000000000000001" }), [
		"0x0000000000000000000000000000000000000001",
	]);
});

test("buildClaimLaunchAdminWallets does not treat tax recipients as admins", () => {
	assert.deepEqual(buildClaimLaunchAdminWallets({ ownerAddress: null }), []);
});
