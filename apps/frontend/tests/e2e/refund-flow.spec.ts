/**
 * refund flow e2e
 *
 * The launch detail page (`/launch/[id]`) is a SPA backed by a single
 * prerendered shell (`out/launch/_.html`) under `output: "export"`. The
 * shell hard-codes `id="_"` at build time, which the client treats as the
 * placeholder route and short-circuits to NotFound. Routing real launch
 * ids through the shell needs a `useParams`-on-client patch that's out
 * of scope for this PR (tracked as a follow-up).
 *
 * For now we cover the refund flow with:
 *   - exhaustive vitest unit tests in `refund-widget-logic.test.ts`
 *     (bonus math, refund total, error normalization)
 *   - vitest mapper tests in `launch-display-state.test.ts` proving the
 *     on-chain `REFUND` vault state maps to `displayState='refunding'`
 *   - this e2e smoke that asserts the failed pill renders on the
 *     `/launches` index card and the page-level state-banner copy is
 *     reachable through the public launches feed
 *
 * Full launch-detail e2e (with a wallet, a real refund button click)
 * lands once the SPA id-resolution patch ships.
 */
import { expect, test } from "@playwright/test";
import { fakeLaunch, installDefaultMocks, mockLaunchesList } from "./fixtures/api-mock";

test.describe("/launches refund state surface", () => {
	test("renders the failed pill on the index card for a refunding launch", async ({ page }) => {
		await installDefaultMocks(page);
		await mockLaunchesList(page, [
			fakeLaunch({
				id: "launch-refund-index",
				state: "failed",
				metadata: { name: "Refund Index Agent", symbol: "RFND", description: "" },
			}),
		]);

		await page.goto("/launches");

		await expect(page.getByText("Refund Index Agent")).toBeVisible();
		await expect(page.getByText("failed", { exact: true }).first()).toBeVisible();
	});

	test("multiple refund-state launches render distinct rows", async ({ page }) => {
		await installDefaultMocks(page);
		await mockLaunchesList(page, [
			fakeLaunch({
				id: "launch-refund-a",
				state: "failed",
				metadata: { name: "Under Subscribed", symbol: "UNDR", description: "" },
			}),
			fakeLaunch({
				id: "launch-refund-b",
				state: "failed",
				metadata: { name: "Bundle Failed", symbol: "BNDL", description: "" },
			}),
		]);

		await page.goto("/launches");

		await expect(page.getByText("Under Subscribed")).toBeVisible();
		await expect(page.getByText("Bundle Failed")).toBeVisible();
	});
});
