import { expect, test } from "@playwright/test";
import { fakeLaunch, installDefaultMocks, mockLaunchesList } from "./fixtures/api-mock";

test.describe("/launches", () => {
	test("renders empty state when no launches", async ({ page }) => {
		await installDefaultMocks(page);
		await page.goto("/launches");

		// PageHeader copy is part of the index. Look for the page eyebrow.
		await expect(page.getByText(/waifu\.fun \/ launches/i)).toBeVisible();
		await expect(page.getByRole("heading", { name: "launches" })).toBeVisible();
	});

	test("renders cards with name, ticker, state pill", async ({ page }) => {
		await mockLaunchesList(page, [
			fakeLaunch({
				id: "launch-open-1",
				state: "open",
				metadata: {
					name: "Test Agent One",
					symbol: "TST1",
					description: "an agent",
				},
			}),
			fakeLaunch({
				id: "launch-launched-1",
				state: "launched",
				metadata: {
					name: "Test Agent Two",
					symbol: "TST2",
					description: "another agent",
				},
			}),
		]);
		// Default fallback for everything else.
		await page.route("**/v2/agents**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: { agents: [], total: 0, stats: null } }),
			}),
		);

		await page.goto("/launches");

		await expect(page.getByText("Test Agent One")).toBeVisible();
		await expect(page.getByText("Test Agent Two")).toBeVisible();
		// State pill text is rendered as lowercase.
		await expect(page.getByText("open", { exact: true }).first()).toBeVisible();
		// Tickers render with a leading $.
		await expect(page.getByText("$TST1")).toBeVisible();
	});
});
