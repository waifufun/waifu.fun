const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ONE = 10n ** 18n;

const STATE_OPEN = 0n;
const STATE_CLOSED = 1n;
const STATE_LAUNCHED = 2n;

const PRESALE_TOKENS = 200_000_000n * ONE; // 200M
const PENALTY_BPS = 500n; // 5%
const VEST_WINDOW = 86_400n; // 24h
const ONE_DAY = 24n * 60n * 60n;

const ERROR_SELECTORS = {
	NotOwner: "0x30cd7471",
	NotAuthorizedToClose: null,
	InvalidState: "0xbaf3f0f7",
	InvalidParams: "0xa86b6512",
	ZeroAmount: "0x1f2a2005",
	InsufficientDeposit: "0x0e1eddda",
	NoDeposit: "0x3a6a68b1",
	NothingToClaim: "0x969bf728",
	LaunchTransferFailed: "0x617b07a1",
	TokenBalanceTooLow: "0x8cf25597",
};

async function expectCustomError(promise, errorName) {
	const sel = ERROR_SELECTORS[errorName];
	await assert.rejects(promise, (err) => {
		const s = String(err);
		if (s.includes(errorName)) return true;
		if (sel && s.toLowerCase().includes(sel.toLowerCase())) return true;
		return false;
	});
}

async function increaseTime(seconds) {
	await network.provider.send("evm_increaseTime", [Number(seconds)]);
	await network.provider.send("evm_mine", []);
}

async function setNextBlockTimestamp(ts) {
	await network.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
	await network.provider.send("evm_mine", []);
}

async function snapshotBalance(addr) {
	return ethers.provider.getBalance(addr);
}

async function currentBlockTimestamp() {
	const block = await ethers.provider.getBlock("latest");
	return BigInt(block.timestamp);
}

async function deployFixture(overrides = {}) {
	const [owner, alice, bob, carol, dave] = await ethers.getSigners();

	const router = await ethers.deployContract("MockLaunchRouter");
	await router.waitForDeployment();
	const routerAddr = await router.getAddress();

	const token = await ethers.deployContract("ERC20Mock");
	await token.waitForDeployment();

	const nowTs = await currentBlockTimestamp();
	const defaultClose = nowTs + ONE_DAY;

	const params = {
		owner: owner.address,
		launchRouter: routerAddr,
		presaleTokens: PRESALE_TOKENS,
		penaltyBps: PENALTY_BPS,
		vestingEnabled: false,
		closeTimestamp: defaultClose,
		...overrides,
	};

	const vault = await ethers.deployContract("LaunchVault", [
		params.owner,
		params.launchRouter,
		params.presaleTokens,
		params.penaltyBps,
		params.vestingEnabled,
		params.closeTimestamp,
	]);
	await vault.waitForDeployment();

	return { owner, alice, bob, carol, dave, vault, router, token, routerAddr, params };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LaunchVault - constructor", () => {
	it("deploys with valid params and starts in OPEN state", async () => {
		const { vault, owner, routerAddr, params } = await deployFixture();
		assert.equal(await vault.owner(), owner.address);
		assert.equal(await vault.launchRouter(), routerAddr);
		assert.equal(await vault.presaleTokens(), PRESALE_TOKENS);
		assert.equal(await vault.penaltyBps(), PENALTY_BPS);
		assert.equal(await vault.vestingEnabled(), false);
		assert.equal(await vault.closeTimestamp(), params.closeTimestamp);
		assert.equal(await vault.state(), STATE_OPEN);
	});

	it("constructor accepts vestingEnabled=true", async () => {
		const { vault } = await deployFixture({ vestingEnabled: true });
		assert.equal(await vault.vestingEnabled(), true);
	});

	it("reverts on zero owner / router / presaleTokens / past closeTimestamp", async () => {
		const [signer] = await ethers.getSigners();
		const router = await ethers.deployContract("MockLaunchRouter");
		const r = await router.getAddress();
		const nowTs = await currentBlockTimestamp();
		const future = nowTs + ONE_DAY;

		await expectCustomError(
			ethers.deployContract("LaunchVault", [
				ethers.ZeroAddress,
				r,
				PRESALE_TOKENS,
				PENALTY_BPS,
				false,
				future,
			]),
			"InvalidParams",
		);
		await expectCustomError(
			ethers.deployContract("LaunchVault", [
				signer.address,
				ethers.ZeroAddress,
				PRESALE_TOKENS,
				PENALTY_BPS,
				false,
				future,
			]),
			"InvalidParams",
		);
		await expectCustomError(
			ethers.deployContract("LaunchVault", [signer.address, r, 0n, PENALTY_BPS, false, future]),
			"InvalidParams",
		);
		await expectCustomError(
			ethers.deployContract("LaunchVault", [signer.address, r, PRESALE_TOKENS, PENALTY_BPS, false, 1n]),
			"InvalidParams",
		);
	});

	it("reverts when penaltyBps is above the 10% cap", async () => {
		const [signer] = await ethers.getSigners();
		const router = await ethers.deployContract("MockLaunchRouter");
		const r = await router.getAddress();
		const nowTs = await currentBlockTimestamp();
		await expectCustomError(
			ethers.deployContract("LaunchVault", [
				signer.address,
				r,
				PRESALE_TOKENS,
				1_001n,
				false,
				nowTs + ONE_DAY,
			]),
			"InvalidParams",
		);
	});

	it("accepts penaltyBps at the 10% cap exactly", async () => {
		const { vault } = await deployFixture({ penaltyBps: 1_000n });
		assert.equal(await vault.penaltyBps(), 1_000n);
	});
});

describe("LaunchVault - deposit window", () => {
	it("accepts deposits in OPEN and tracks per-user + total", async () => {
		const { vault, alice, bob } = await deployFixture();

		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("3") });
		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });

		assert.equal((await vault.depositors(alice.address)).deposited, ethers.parseEther("2"));
		assert.equal((await vault.depositors(bob.address)).deposited, ethers.parseEther("3"));
		assert.equal(await vault.totalDeposited(), ethers.parseEther("5"));
		assert.equal(await vault.depositorCount(), 2n);
	});

	it("reverts deposit() with zero value", async () => {
		const { vault, alice } = await deployFixture();
		await expectCustomError(vault.connect(alice).deposit({ value: 0n }), "ZeroAmount");
	});

	it("reverts deposit() after close()", async () => {
		const { vault, owner, alice } = await deployFixture();
		await vault.connect(owner).close();
		await expectCustomError(vault.connect(alice).deposit({ value: ethers.parseEther("1") }), "InvalidState");
	});

	it("rejects stray BNB sent directly to the vault (no receive bypass)", async () => {
		const { vault, alice } = await deployFixture();
		const vaultAddr = await vault.getAddress();
		await assert.rejects(alice.sendTransaction({ to: vaultAddr, value: ethers.parseEther("1") }));
	});
});

describe("LaunchVault - withdrawal + penalty", () => {
	it("withdraw() applies 5% penalty and refunds 95%", async () => {
		const { vault, alice } = await deployFixture();
		const amount = ethers.parseEther("10");
		await vault.connect(alice).deposit({ value: amount });

		const before = await snapshotBalance(alice.address);
		const tx = await vault.connect(alice).withdraw(amount);
		const receipt = await tx.wait();
		const gas = receipt.gasUsed * receipt.gasPrice;
		const after = await snapshotBalance(alice.address);

		const expectedRefund = ethers.parseEther("9.5");
		assert.equal(after - before + gas, expectedRefund);

		assert.equal((await vault.depositors(alice.address)).deposited, 0n);
		assert.equal(await vault.totalDeposited(), 0n);
		assert.equal(await vault.bonusPool(), ethers.parseEther("0.5"));
	});

	it("withdrawAll() forwards full deposit through withdraw()", async () => {
		const { vault, alice } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });

		await vault.connect(alice).withdrawAll();
		assert.equal((await vault.depositors(alice.address)).deposited, 0n);
		assert.equal(await vault.bonusPool(), ethers.parseEther("0.2"));
	});

	it("partial withdraw leaves remainder allocated correctly", async () => {
		const { vault, alice } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("10") });
		await vault.connect(alice).withdraw(ethers.parseEther("4"));

		assert.equal((await vault.depositors(alice.address)).deposited, ethers.parseEther("6"));
		assert.equal(await vault.totalDeposited(), ethers.parseEther("6"));
		assert.equal(await vault.bonusPool(), ethers.parseEther("0.2"));
	});

	it("withdraw() reverts on zero, insufficient deposit, and after close()", async () => {
		const { vault, owner, alice } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });

		await expectCustomError(vault.connect(alice).withdraw(0n), "ZeroAmount");
		await expectCustomError(vault.connect(alice).withdraw(ethers.parseEther("2")), "InsufficientDeposit");

		await vault.connect(owner).close();
		await expectCustomError(vault.connect(alice).withdraw(ethers.parseEther("1")), "InvalidState");
		await expectCustomError(vault.connect(alice).withdrawAll(), "InvalidState");
	});

	it("withdrawAll() reverts when caller has no deposit", async () => {
		const { vault, alice } = await deployFixture();
		await expectCustomError(vault.connect(alice).withdrawAll(), "NoDeposit");
	});
});

describe("LaunchVault - close + launch", () => {
	it("owner can close() any time from OPEN", async () => {
		const { vault, owner } = await deployFixture();
		await vault.connect(owner).close();
		assert.equal(await vault.state(), STATE_CLOSED);
		await expectCustomError(vault.connect(owner).close(), "InvalidState");
	});

	it("non-owner cannot close() before closeTimestamp", async () => {
		const { vault, alice } = await deployFixture();
		await expectCustomError(vault.connect(alice).close(), "NotAuthorizedToClose");
	});

	it("anyone can close() after closeTimestamp passes (auto-close)", async () => {
		const { vault, alice, params } = await deployFixture();
		await setNextBlockTimestamp(BigInt(params.closeTimestamp) + 1n);
		await vault.connect(alice).close();
		assert.equal(await vault.state(), STATE_CLOSED);
	});

	it("launch() forwards (deposits + bonusPool) BNB to launchRouter", async () => {
		const { vault, owner, alice, bob, router, token } = await deployFixture();

		await vault.connect(alice).deposit({ value: ethers.parseEther("8") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("4") });
		await vault.connect(alice).withdraw(ethers.parseEther("2"));

		await vault.connect(owner).close();

		const tokenAddr = await token.getAddress();
		await vault.connect(owner).launch(tokenAddr);

		assert.equal(await vault.state(), STATE_LAUNCHED);
		assert.equal(await vault.token(), tokenAddr);
		assert.equal(await vault.totalDepositedAtLaunch(), ethers.parseEther("10"));
		assert.equal(await router.received(), ethers.parseEther("10.1"));
		assert.equal(await ethers.provider.getBalance(await vault.getAddress()), 0n);
	});

	it("launch() reverts on bad caller / wrong state / zero token / failing transfer", async () => {
		const { vault, owner, alice, router, token } = await deployFixture();
		const tokenAddr = await token.getAddress();

		await expectCustomError(vault.connect(owner).launch(tokenAddr), "InvalidState");

		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await vault.connect(owner).close();

		await expectCustomError(vault.connect(alice).launch(tokenAddr), "NotOwner");
		await expectCustomError(vault.connect(owner).launch(ethers.ZeroAddress), "InvalidParams");

		await router.setRejectIncoming(true);
		await expectCustomError(vault.connect(owner).launch(tokenAddr), "LaunchTransferFailed");
	});
});

describe("LaunchVault - vesting disabled (100% TGE)", () => {
	async function launchedNoVestingFixture() {
		const ctx = await deployFixture({ vestingEnabled: false });
		const { vault, owner, alice, bob, token } = ctx;

		await vault.connect(alice).deposit({ value: ethers.parseEther("6") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("4") });

		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());

		await token.mint(await vault.getAddress(), PRESALE_TOKENS);

		return ctx;
	}

	it("vestingEnabled=false: 100% claimable immediately at TGE", async () => {
		const { vault, alice, bob, token } = await launchedNoVestingFixture();

		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;
		const bobAlloc = (PRESALE_TOKENS * 4n) / 10n;

		await vault.connect(alice).claim();
		await vault.connect(bob).claim();

		assert.equal(await token.balanceOf(alice.address), aliceAlloc);
		assert.equal(await token.balanceOf(bob.address), bobAlloc);
	});

	it("double-claim reverts NothingToClaim when vestingEnabled=false", async () => {
		const { vault, alice } = await launchedNoVestingFixture();
		await vault.connect(alice).claim();
		await expectCustomError(vault.connect(alice).claim(), "NothingToClaim");
	});
});

describe("LaunchVault - vesting enabled (50% TGE + 50% over 24h)", () => {
	async function launchedVestingFixture() {
		const ctx = await deployFixture({ vestingEnabled: true });
		const { vault, owner, alice, bob, token } = ctx;

		await vault.connect(alice).deposit({ value: ethers.parseEther("6") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("4") });

		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());

		await token.mint(await vault.getAddress(), PRESALE_TOKENS);

		return ctx;
	}

	it("at 0h (TGE), 50% claimable", async () => {
		const { vault, alice, token } = await launchedVestingFixture();
		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;

		await vault.connect(alice).claim();
		const got = await token.balanceOf(alice.address);
		const expected = aliceAlloc / 2n;
		// Tiny drift tolerance from block timestamp progression.
		const tolerance = aliceAlloc / 1_000n; // 0.1%
		const diff = got > expected ? got - expected : expected - got;
		assert.ok(diff <= tolerance, `TGE drift too large: got=${got} expected=${expected}`);
	});

	it("at 12h, ~75% claimable (50% TGE + 25% linear)", async () => {
		const { vault, alice, token } = await launchedVestingFixture();
		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;

		await increaseTime(VEST_WINDOW / 2n);
		await vault.connect(alice).claim();

		const got = await token.balanceOf(alice.address);
		const expected = (aliceAlloc * 75n) / 100n;
		const tolerance = aliceAlloc / 1_000n;
		const diff = got > expected ? got - expected : expected - got;
		assert.ok(diff <= tolerance, `12h drift too large: got=${got} expected=${expected}`);
	});

	it("at 24h, 100% claimable", async () => {
		const { vault, alice, token } = await launchedVestingFixture();
		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;

		await increaseTime(VEST_WINDOW + 1n);
		await vault.connect(alice).claim();
		assert.equal(await token.balanceOf(alice.address), aliceAlloc);
	});

	it("incremental claims sum to allocation across full vesting window", async () => {
		const { vault, alice, token } = await launchedVestingFixture();
		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;

		// First claim near TGE
		await vault.connect(alice).claim();
		const afterTge = await token.balanceOf(alice.address);
		const tgeExpected = aliceAlloc / 2n;
		const tgeTolerance = aliceAlloc / 1_000n;
		const tgeDiff = afterTge > tgeExpected ? afterTge - tgeExpected : tgeExpected - afterTge;
		assert.ok(tgeDiff <= tgeTolerance, `tge claim drift too large`);

		await increaseTime(VEST_WINDOW + 1n);
		await vault.connect(alice).claim();
		assert.equal(await token.balanceOf(alice.address), aliceAlloc);
	});

	it("two depositors share 100% of presaleTokens after full vesting", async () => {
		const { vault, alice, bob, token } = await launchedVestingFixture();

		await increaseTime(VEST_WINDOW + 1n);
		await vault.connect(alice).claim();
		await vault.connect(bob).claim();

		const total = (await token.balanceOf(alice.address)) + (await token.balanceOf(bob.address));
		const diff = total > PRESALE_TOKENS ? total - PRESALE_TOKENS : PRESALE_TOKENS - total;
		assert.ok(diff <= 1n, `pro-rata totals diverge: ${diff}`);
	});

	it("claim reverts TokenBalanceTooLow if vault wasn't funded", async () => {
		const { vault, owner, alice, token } = await deployFixture({ vestingEnabled: true });
		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());

		await increaseTime(VEST_WINDOW + 1n);
		await expectCustomError(vault.connect(alice).claim(), "TokenBalanceTooLow");
	});
});

describe("LaunchVault - claim guards", () => {
	it("claim before launch reverts (state guard)", async () => {
		const { vault, alice } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await expectCustomError(vault.connect(alice).claim(), "InvalidState");
	});

	it("claim with no deposit reverts (NoDeposit)", async () => {
		const { vault, owner, alice, carol, token } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);
		await expectCustomError(vault.connect(carol).claim(), "NoDeposit");
	});
});

describe("LaunchVault - view + accounting invariants", () => {
	it("getDepositorInfo + getPresaleInfo return consistent values pre/post launch", async () => {
		const { vault, owner, alice, bob, token } = await deployFixture({ vestingEnabled: false });
		await vault.connect(alice).deposit({ value: ethers.parseEther("2") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("3") });
		await vault.connect(alice).withdraw(ethers.parseEther("1"));

		const preInfo = await vault.getPresaleInfo();
		assert.equal(preInfo.currentState, STATE_OPEN);
		assert.equal(preInfo.totalDeposited_, ethers.parseEther("4"));
		assert.equal(preInfo.bonusPool_, ethers.parseEther("0.05"));
		assert.equal(preInfo.depositorCount_, 2n);

		const aliceInfo = await vault.getDepositorInfo(alice.address);
		assert.equal(aliceInfo.deposited, ethers.parseEther("1"));
		assert.equal(aliceInfo.totalTokens, (PRESALE_TOKENS * 1n) / 4n);
		assert.equal(aliceInfo.vested, 0n);
		assert.equal(aliceInfo.claimable, 0n);

		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);

		const postInfo = await vault.getPresaleInfo();
		assert.equal(postInfo.currentState, STATE_LAUNCHED);
		assert.notEqual(postInfo.launchTimestamp_, 0n);

		const aliceAfter = await vault.getDepositorInfo(alice.address);
		assert.equal(aliceAfter.totalTokens, (PRESALE_TOKENS * 1n) / 4n);
	});

	it("BNB conservation: sum(refunds + bonusPool) == sum(net deposits)", async () => {
		const { vault, alice, bob, carol } = await deployFixture();

		await vault.connect(alice).deposit({ value: ethers.parseEther("5") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("3") });
		await vault.connect(carol).deposit({ value: ethers.parseEther("2") });

		await vault.connect(alice).withdraw(ethers.parseEther("2"));
		await vault.connect(bob).withdrawAll();

		const vaultAddr = await vault.getAddress();
		const bal = await ethers.provider.getBalance(vaultAddr);
		assert.equal(bal, ethers.parseEther("5.25"));

		assert.equal(await vault.totalDeposited(), ethers.parseEther("5"));
		assert.equal(await vault.bonusPool(), ethers.parseEther("0.25"));
	});
});
