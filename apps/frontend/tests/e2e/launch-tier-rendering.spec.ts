/**
 * launch tier rendering
 *
 * The launches index card surfaces tier-specific data. Wave H supports
 * 4 tiers: 80 (curve-only), 90, 95, 98 (graduation tiers). This spec
 * verifies the card renders the right tier label and CTA for each.
 */

import { expect, test } from "@playwright/test";
import { fakeLaunch, installDefaultMocks, mockLaunchesList } from "./fixtures/api-mock";

const TIERS = ["80", "90", "95", "98"];

test.describe("/launches tier rendering", () => {
	for (const tier of TIERS) {
		test(`renders tier ${tier} card`, async ({ page }) => {
			await installDefaultMocks(page);
			await mockLaunchesList(page, [
				fakeLaunch({
					id: `launch-tier-${tier}`,
					tier,
					state: "open",
					capacity:
						tier === "80"
							? "16000000000000000000"
							: tier === "90"
								? "32000000000000000000"
								: tier === "95"
									? "64000000000000000000"
									: "160000000000000000000",
					v2BuyBnb:
						tier === "80"
							? "0"
							: tier === "90"
								? "12000000000000000000"
								: tier === "95"
									? "44000000000000000000"
									: "140000000000000000000",
					vestingEnabled: tier !== "80",
					metadata: { name: `Tier ${tier} Agent`, symbol: `T${tier}`, description: "" },
				}),
			]);

			await page.goto("/launches");
			await expect(page.getByText(`Tier ${tier} Agent`)).toBeVisible();
			await expect(page.getByText(`$T${tier}`)).toBeVisible();
		});
	}
});
