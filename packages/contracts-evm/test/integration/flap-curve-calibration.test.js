// FLAP curve fill calibration on a BSC fork.
// Runs only when FORK_BSC=true so default test runs stay fast.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const FORK_ENABLED = process.env.FORK_BSC === "true";

// BSC mainnet address book.
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

const PORTAL_ABI = [
	"function version() view returns (string)",
	"function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address)",
	"function getTokenV8(address token) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId) state)",
];

const FACTORY_ABI = ["function getPair(address, address) view returns (address)"];

async function resetSignerCode(address) {
	const methods = ["hardhat_setCode", "anvil_setCode", "evm_setAccountCode"];
	let lastError;
	for (const method of methods) {
		try {
			await network.provider.request({
				method,
				params: [address, "0x"],
			});
			return;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

function cloneInitCode(impl) {
	const stripped = impl.slice(2).toLowerCase();
	return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${stripped}5af43d82803e903d91602b57fd5bf3`;
}

const INIT_CODE_HASH = ethers.keccak256(cloneInitCode(TAX_V3_IMPL));

function mineVanitySalt(deployer, codeHash, label) {
	const maxIterations = 4_000_000;
	let salt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], [label]));
	for (let i = 0; i < maxIterations; i += 1) {
		const predicted = ethers.getCreate2Address(deployer, salt, codeHash);
		if (predicted.toLowerCase().endsWith("7777")) {
			return { salt, predicted, iterations: i };
		}
		salt = ethers.keccak256(salt);
	}
	throw new Error(`salt mining exceeded ${maxIterations} iterations`);
}

describe("FLAP curve calibration v5.14.3", () => {
	if (!FORK_ENABLED) {
		it.skip("requires FORK_BSC=true", () => {});
		return;
	}

	const samples = [16.0, 16.2, 16.4, 16.6, 16.8, 17.0];

	before(async () => {
		const blockNumber = await ethers.provider.getBlockNumber();
		const chainId = (await ethers.provider.getNetwork()).chainId;
		console.log(`    [fork] chainId=${chainId} blockNumber=${blockNumber}`);
		expect(Number(chainId)).to.equal(56);
	});

	for (const quoteEth of samples) {
		it(`quoteAmt ${quoteEth} BNB`, async function () {
			this.timeout(120_000);

			const signer = (await ethers.getSigners())[Math.floor(quoteEth * 10) % 10];
			await resetSignerCode(signer.address);

			await network.provider.send("evm_increaseTime", [200]);
			await network.provider.send("evm_mine");

			const { salt, predicted } = mineVanitySalt(PORTAL, INIT_CODE_HASH, `calibration-${quoteEth}`);

			const quoteAmt = ethers.parseEther(quoteEth.toString());
			const params = {
				name: "Calibration",
				symbol: `C${Math.floor(quoteEth * 10)}`,
				meta: "bafkreireal2QmTestQmTestQmTestQmTestQmTestQm",
				dexThresh: 1,
				salt,
				migratorType: 1,
				quoteToken: ethers.ZeroAddress,
				quoteAmt,
				beneficiary: signer.address,
				permitData: "0x",
				extensionID: ethers.ZeroHash,
				extensionData: "0x",
				dexId: 0,
				lpFeeProfile: 0,
				buyTaxRate: 300,
				sellTaxRate: 1000,
				taxDuration: 365 * 86400,
				antiFarmerDuration: 86400,
				mktBps: 10000,
				deflationBps: 0,
				dividendBps: 0,
				lpBps: 0,
				minimumShareBalance: 0,
				dividendToken: ethers.ZeroAddress,
				commissionReceiver: signer.address,
				tokenVersion: 6,
			};

			const portal = await ethers.getContractAt(PORTAL_ABI, PORTAL);
			const factory = await ethers.getContractAt(FACTORY_ABI, PCS_FACTORY);

			const tx = await portal.connect(signer).newTokenV6(params, {
				value: quoteAmt,
				gasLimit: 8_000_000,
			});
			const receipt = await tx.wait();
			expect(receipt.status).to.equal(1);

			const state = await portal.getTokenV8(predicted);
			const pair = await factory.getPair(predicted, WBNB);
			const status = Number(state.status);
			const statusName = status === 1 ? "Tradable" : status === 4 ? "DEX" : `Status-${status}`;
			const progress = (Number(state.progress) / 1e18).toFixed(4);

			console.log(
				`    [${quoteEth} BNB] status=${statusName} progress=${progress} pair=${pair === ethers.ZeroAddress ? "NONE" : pair}`,
			);

			if (quoteEth >= 16.8) {
				expect(status).to.equal(4);
				expect(pair).to.not.equal(ethers.ZeroAddress);
			} else {
				expect(status).to.not.equal(4);
				expect(pair).to.equal(ethers.ZeroAddress);
			}
		});
	}
});
