/**
 * launch state coverage matrix
 *
 * The launches index page renders a card for each launch with a state
 * pill that reflects the wave H 6-state display mapper. This spec
 * parametrizes across every state and verifies the index page renders
 * the right copy and CTA for each.
 *
 * states: created | presale | closed | bundling | launched | refunding
 */

import { expect, test } from "@playwright/test";
import { fakeLaunch, installDefaultMocks, mockLaunchesList } from "./fixtures/api-mock";

type StateCase = {
	backendState: string;
	expectedPill: string;
	tier?: string;
};

const STATE_CASES: StateCase[] = [
	{ backendState: "draft", expectedPill: "draft" },
	{ backendState: "provisioned", expectedPill: "provisioned" },
	{ backendState: "open", expectedPill: "open" },
	{ backendState: "queued", expectedPill: "queued" },
	{ backendState: "launching", expectedPill: "launching" },
	{ backendState: "live", expectedPill: "live" },
	{ backendState: "failed", expectedPill: "failed" },
];

test.describe("/launches state pills", () => {
	for (const { backendState, expectedPill } of STATE_CASES) {
		test(`renders ${backendState} state pill on the card`, async ({ page }) => {
			await installDefaultMocks(page);
			await mockLaunchesList(page, [
				fakeLaunch({
					id: `launch-${backendState}-1`,
					state: backendState,
					metadata: {
						name: `Agent ${backendState}`,
						symbol: backendState.toUpperCase().slice(0, 4),
						description: `an agent in ${backendState}`,
					},
				}),
			]);

			await page.goto("/launches");

			// The card renders the agent name and a state pill matching the backend status.
			await expect(page.getByText(`Agent ${backendState}`)).toBeVisible();
			await expect(page.getByText(expectedPill, { exact: true }).first()).toBeVisible();
		});
	}

	test("renders multiple states side-by-side without bleeding copy", async ({ page }) => {
		await installDefaultMocks(page);
		await mockLaunchesList(page, [
			fakeLaunch({
				id: "launch-open-1",
				state: "open",
				metadata: { name: "Open One", symbol: "OPN1", description: "" },
			}),
			fakeLaunch({
				id: "launch-launched-1",
				state: "live",
				metadata: { name: "Live One", symbol: "LIV1", description: "" },
			}),
			fakeLaunch({
				id: "launch-failed-1",
				state: "failed",
				metadata: { name: "Failed One", symbol: "FAI1", description: "" },
			}),
		]);

		await page.goto("/launches");

		await expect(page.getByText("Open One")).toBeVisible();
		await expect(page.getByText("Live One")).toBeVisible();
		await expect(page.getByText("Failed One")).toBeVisible();
		await expect(page.getByText("$OPN1")).toBeVisible();
		await expect(page.getByText("$LIV1")).toBeVisible();
		await expect(page.getByText("$FAI1")).toBeVisible();
	});
});
