import assert from "node:assert/strict";
import test from "node:test";

import { isElizaCloudActivity, repoLabelForActivity } from "../src/lib/github-listener.js";

const elizaRepo = { org: "elizaos", repo: "eliza", label: "eliza-os" };

test("labels eliza cloud by conventional commit scope", () => {
	assert.equal(repoLabelForActivity(elizaRepo, "feat(cloud): add usage meter"), "eliza-cloud");
	assert.equal(repoLabelForActivity(elizaRepo, "fix(eliza-cloud): repair billing"), "eliza-cloud");
});

test("labels eliza cloud by touched paths", () => {
	assert.equal(repoLabelForActivity(elizaRepo, "refactor runtime", ["packages/cloud/src/index.ts"]), "eliza-cloud");
	assert.equal(repoLabelForActivity(elizaRepo, "update app", ["apps/eliza-cloud/src/app.ts"]), "eliza-cloud");
	assert.equal(repoLabelForActivity(elizaRepo, "fix deployment", ["apps/cloud/deploy.ts"]), "eliza-cloud");
});

test("keeps eliza-os label for non-cloud eliza commits", () => {
	assert.equal(
		repoLabelForActivity(elizaRepo, "feat(runtime): improve memory", ["packages/core/src/memory.ts"]),
		"eliza-os",
	);
	assert.equal(isElizaCloudActivity("feat(runtime): improve memory", ["packages/core/src/memory.ts"]), false);
});

test("does not split non-eliza repos", () => {
	assert.equal(
		repoLabelForActivity({ org: "waifufun", repo: "waifu.fun", label: "waifu" }, "feat(cloud): launch", [
			"apps/cloud/a.ts",
		]),
		"waifu",
	);
});
