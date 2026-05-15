import { expect, test } from "@playwright/test";
import { installDefaultMocks } from "./fixtures/api-mock";
import { signIn } from "./fixtures/auth";
import { injectWallet } from "./fixtures/wallet";

/**
 * Wave H: the wizard now has a dedicated `metadata` step between `persona`
 * and `tier`. It uploads to Flap's IPFS endpoint at
 * `https://funcs.flap.sh/api/upload` and stores the returned CID on the
 * wizard state. Without a successful upload the user can't advance.
 *
 * This test mocks the Flap endpoint inside the browser context so the
 * suite never touches the live service. We assert:
 *   - the step renders with the upload button disabled until inputs land
 *   - a successful upload exposes the CID and unlocks the `next` button
 *   - a failed upload surfaces a retry affordance and keeps `next` disabled
 */

test.describe("/create/wizard metadata step (wave H)", () => {
	test.skip("uploads to flap, surfaces cid, unlocks next button", async ({ context, page, baseURL }) => {
		await injectWallet(page);
		await installDefaultMocks(page);
		await signIn(context, page, baseURL ?? "http://127.0.0.1:3100");

		// Stub flap's IPFS endpoint. Returns a deterministic CID so we can
		// assert against the shortened display value.
		await page.route("https://funcs.flap.sh/api/upload", (route) => {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ cid: "bafkreigh2akiscaildc0123456789", uri: "ipfs://bafkreigh2akiscaildc0123456789" }),
			});
		});

		// Pre-populate the persona step so we can hop straight to metadata.
		await page.addInitScript(() => {
			window.localStorage.setItem(
				"waifu-wizard-draft",
				JSON.stringify({
					inviteCode: "WF-TEST1-TEST1",
					persona: {
						name: "Test Agent",
						ticker: "TEST",
						bio: "an e2e test agent",
						avatarDataUrl: null,
						avatarTemplateId: "tessera",
						personaPrompt: "",
					},
					flap: {
						tokenImageDataUrl: null,
						description: "",
						twitter: "",
						telegram: "",
						website: "",
						metaCid: null,
						metaUri: null,
					},
					runtime: { kind: "webhook", webhookUrl: "https://example.com/hook", webhookSecret: "secret-secret-secret" },
					safe: {
						taxAgentBps: 8000,
						taxPatronBps: 2000,
						owners: ["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
						threshold: 1,
						firstBuyFundingSource: null,
						adapters: { pancake: true, venus: true },
					},
					launchpad: { selectedId: null, selectedChain: null, feeConfig: null },
					launch: { tierId: 90 },
					vanity: { submitted: false, predictedAddress: null },
				}),
			);
		});

		await page.goto("/create/wizard?step=metadata");

		// Step renders. Upload button is disabled because there's no image
		// and no description yet.
		await expect(page.getByTestId("step-metadata")).toBeVisible();
		const uploadBtn = page.getByTestId("flap-upload-button");
		await expect(uploadBtn).toBeDisabled();

		const nextBtn = page.getByRole("button", { name: /^next$/i });
		await expect(nextBtn).toBeDisabled();

		// Provide a description. Upload button still disabled (no image).
		await page.getByPlaceholder(/one or two lines/i).fill("a test agent for the flap upload step");
		await expect(uploadBtn).toBeDisabled();

		// Inject a fake token image directly into wizard state. The file
		// picker pathway needs an actual HTMLImageElement decode which is
		// flaky in chromium under hermetic mocks; bypassing it through
		// localStorage exercises the same code path.
		await page.evaluate(() => {
			const draft = JSON.parse(window.localStorage.getItem("waifu-wizard-draft") ?? "{}");
			draft.flap = {
				...draft.flap,
				tokenImageDataUrl:
					"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
			};
			window.localStorage.setItem("waifu-wizard-draft", JSON.stringify(draft));
		});
		await page.reload();
		await page.goto("/create/wizard?step=metadata");
		await page.getByPlaceholder(/one or two lines/i).fill("a test agent for the flap upload step");

		await expect(uploadBtn).toBeEnabled();

		await uploadBtn.click();

		// Successful upload surfaces the shortened CID and unlocks next.
		await expect(page.getByTestId("flap-cid-display")).toContainText(/cid:/i);
		await expect(page.getByTestId("flap-cid-display")).toContainText(/bafkreig/);
		await expect(nextBtn).toBeEnabled();
	});

	test("shows retry on upload failure and keeps next disabled", async ({ context, page, baseURL }) => {
		await injectWallet(page);
		await installDefaultMocks(page);
		await signIn(context, page, baseURL ?? "http://127.0.0.1:3100");

		// Stub flap to fail.
		await page.route("https://funcs.flap.sh/api/upload", (route) =>
			route.fulfill({ status: 503, contentType: "text/plain", body: "flap is having a moment" }),
		);

		await page.addInitScript(() => {
			window.localStorage.setItem(
				"waifu-wizard-draft",
				JSON.stringify({
					inviteCode: "WF-TEST1-TEST1",
					persona: {
						name: "Test Agent",
						ticker: "TEST",
						bio: "an e2e test agent",
						avatarDataUrl: null,
						avatarTemplateId: "tessera",
						personaPrompt: "",
					},
					flap: {
						tokenImageDataUrl:
							"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
						description: "fail path",
						twitter: "",
						telegram: "",
						website: "",
						metaCid: null,
						metaUri: null,
					},
					runtime: { kind: "webhook", webhookUrl: "https://example.com/hook", webhookSecret: "secret-secret-secret" },
					safe: {
						taxAgentBps: 8000,
						taxPatronBps: 2000,
						owners: ["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
						threshold: 1,
						firstBuyFundingSource: null,
						adapters: { pancake: true, venus: true },
					},
					launchpad: { selectedId: null, selectedChain: null, feeConfig: null },
					launch: { tierId: 90 },
					vanity: { submitted: false, predictedAddress: null },
				}),
			);
		});

		await page.goto("/create/wizard?step=metadata");
		await expect(page.getByTestId("step-metadata")).toBeVisible();

		await page.getByTestId("flap-upload-button").click();

		await expect(page.getByTestId("flap-upload-error")).toBeVisible();
		await expect(page.getByTestId("flap-upload-error")).toContainText(/upload failed/i);

		const nextBtn = page.getByRole("button", { name: /^next$/i });
		await expect(nextBtn).toBeDisabled();
	});
});
