const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

const ONE = 10n ** 18n;
const PRESALE_TOKENS = 200_000_000n * ONE;
const PRESALE_CAP = 10n * ONE;
const ONE_DAY = 24n * 60n * 60n;

async function currentBlockTimestamp() {
	const block = await ethers.provider.getBlock("latest");
	return BigInt(block.timestamp);
}

async function deployVault() {
	const [owner, alice, bob] = await ethers.getSigners();
	const router = await ethers.deployContract("MockLaunchRouter");
	await router.waitForDeployment();
	const token = await ethers.deployContract("ERC20Mock");
	await token.waitForDeployment();
	const nowTs = await currentBlockTimestamp();
	const vault = await ethers.deployContract("LaunchVault", [
		owner.address,
		await router.getAddress(),
		PRESALE_TOKENS,
		PRESALE_CAP,
		0n,
		500n,
		false,
		nowTs + ONE_DAY,
	]);
	await vault.waitForDeployment();
	return { owner, alice, bob, token, vault };
}

async function gasOf(txPromise) {
	const tx = await txPromise;
	const receipt = await tx.wait();
	return receipt.gasUsed;
}

describe("Contracts gas snapshot guard", () => {
	it("keeps LaunchVault core operations under broad regression budgets", async () => {
		const { owner, alice, bob, token, vault } = await deployVault();

		const depositFirst = await gasOf(vault.connect(alice).deposit({ value: 1n * ONE }));
		const depositRepeat = await gasOf(vault.connect(alice).deposit({ value: 1n * ONE }));
		const withdrawPartial = await gasOf(vault.connect(alice).withdraw(1n * ONE));
		await vault.connect(bob).deposit({ value: 9n * ONE });
		const close = await gasOf(vault.connect(owner).close());
		const launch = await gasOf(
			vault.connect(owner).launch(await token.getAddress(), 0, Math.floor(Date.now() / 1000) + 3600),
		);
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);
		const claim = await gasOf(vault.connect(alice).claim());

		const budgets = {
			depositFirst: 125_000n,
			depositRepeat: 75_000n,
			withdrawPartial: 100_000n,
			close: 60_000n,
			launch: 225_000n,
			claim: 140_000n,
		};
		const actual = { depositFirst, depositRepeat, withdrawPartial, close, launch, claim };

		for (const [name, gas] of Object.entries(actual)) {
			assert.ok(gas <= budgets[name], `${name} gas ${gas} exceeds budget ${budgets[name]}`);
		}
	});
});
