const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");

const ONE = 10n ** 18n;
const PRESALE_TOKENS = 200_000_000n * ONE;
const PRESALE_CAP = 10n * ONE;
const ONE_DAY = 24n * 60n * 60n;

async function currentBlockTimestamp() {
	const block = await ethers.provider.getBlock("latest");
	return BigInt(block.timestamp);
}

async function deployVault(overrides = {}) {
	const [owner, alice, bob] = await ethers.getSigners();
	const router = await ethers.deployContract("MockLaunchRouter");
	await router.waitForDeployment();
	const token = await ethers.deployContract("ERC20Mock");
	await token.waitForDeployment();
	const nowTs = await currentBlockTimestamp();
	const params = {
		owner: owner.address,
		launchRouter: await router.getAddress(),
		presaleTokens: PRESALE_TOKENS,
		presaleCap: PRESALE_CAP,
		bnbForBuy: 0n,
		penaltyBps: 500n,
		vestingEnabled: false,
		closeTimestamp: nowTs + ONE_DAY,
		...overrides,
	};
	const vault = await ethers.deployContract("LaunchVault", [
		params.owner,
		params.launchRouter,
		params.presaleTokens,
		params.presaleCap,
		params.bnbForBuy,
		params.penaltyBps,
		params.vestingEnabled,
		params.closeTimestamp,
	]);
	await vault.waitForDeployment();
	return { owner, alice, bob, router, token, vault };
}

async function gasOf(txPromise) {
	const tx = await txPromise;
	const receipt = await tx.wait();
	return receipt.gasUsed;
}

function renderMarkdown(rows) {
	const date = new Date().toISOString().slice(0, 10);
	const lines = [
		"# Contracts Gas Baseline",
		"",
		`Generated on ${date} with \`hardhat run scripts/gas-snapshot.js\`.`,
		"",
		"| Operation | Gas Used |",
		"| --- | ---: |",
	];
	for (const [name, gas] of rows) {
		lines.push(`| ${name} | ${gas.toString()} |`);
	}
	lines.push("");
	return `${lines.join("\n")}\n`;
}

async function main() {
	const rows = [];

	{
		const { vault, alice } = await deployVault();
		rows.push(["LaunchVault.deposit first depositor", await gasOf(vault.connect(alice).deposit({ value: 1n * ONE }))]);
		rows.push(["LaunchVault.deposit repeat depositor", await gasOf(vault.connect(alice).deposit({ value: 1n * ONE }))]);
		rows.push(["LaunchVault.withdraw partial", await gasOf(vault.connect(alice).withdraw(1n * ONE))]);
	}

	{
		const { vault, owner, alice, bob, token } = await deployVault();
		await vault.connect(alice).deposit({ value: 6n * ONE });
		await vault.connect(bob).deposit({ value: 4n * ONE });
		rows.push(["LaunchVault.close", await gasOf(vault.connect(owner).close())]);
		rows.push([
			"LaunchVault.launch",
			await gasOf(vault.connect(owner).launch(await token.getAddress(), 0, Math.floor(Date.now() / 1000) + 3600)),
		]);
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);
		rows.push(["LaunchVault.claim no vesting", await gasOf(vault.connect(alice).claim())]);
	}

	const markdown = renderMarkdown(rows);
	process.stdout.write(markdown);

	if (process.env.WRITE_GAS_BASELINE === "true") {
		const out = path.join(__dirname, "..", "CONTRACTS_GAS_BASELINE.md");
		fs.writeFileSync(out, markdown);
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
