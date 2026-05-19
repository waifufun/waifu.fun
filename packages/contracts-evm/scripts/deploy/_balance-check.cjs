/**
 * _balance-check.cjs - asserts the deployer has at least MIN_BNB on the
 * connected network. Used by scripts/launch-day-suki-deploy.sh.
 *
 * Env:
 *   PRIVATE_KEY    deployer EOA hex (already wired by hardhat.config.js)
 *   MIN_BNB        minimum balance required (default 0.05)
 */

const { ethers, network } = require("hardhat");

async function main() {
	const minStr = process.env.MIN_BNB || "0.05";
	const minWei = ethers.parseEther(minStr);

	const [signer] = await ethers.getSigners();
	if (!signer) throw new Error("no signer: did you set PRIVATE_KEY?");
	const addr = await signer.getAddress();
	const bal = await ethers.provider.getBalance(addr);
	console.log(`network:  ${network.name}`);
	console.log(`deployer: ${addr}`);
	console.log(`balance:  ${ethers.formatEther(bal)} BNB`);
	console.log(`required: ${minStr} BNB`);
	if (bal < minWei) {
		throw new Error(
			`deployer balance ${ethers.formatEther(bal)} BNB is below required ${minStr} BNB. Top up before retrying.`,
		);
	}
	console.log("OK balance check passed");
}

main().catch((e) => {
	console.error(e.message || e);
	process.exitCode = 1;
});
