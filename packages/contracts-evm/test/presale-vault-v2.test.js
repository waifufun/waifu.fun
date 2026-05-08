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
const VEST_DURATION = 30n * 24n * 60n * 60n; // 30 days in seconds
const VEST_CLIFF = 0n;

const ERROR_SELECTORS = {
	NotOwner: "0x30cd7471",
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

async function snapshotBalance(addr) {
	return ethers.provider.getBalance(addr);
}

async function deployFixture(overrides = {}) {
	const [owner, alice, bob, carol, dave] = await ethers.getSigners();

	const router = await ethers.deployContract("MockBundleRouter");
	await router.waitForDeployment();
	const routerAddr = await router.getAddress();

	const token = await ethers.deployContract("ERC20Mock");
	await token.waitForDeployment();

	const params = {
		owner: owner.address,
		bundleRouter: routerAddr,
		presaleTokens: PRESALE_TOKENS,
		penaltyBps: PENALTY_BPS,
		vestingCliff: VEST_CLIFF,
		vestingDuration: VEST_DURATION,
		...overrides,
	};

	const vault = await ethers.deployContract("PresaleVaultV2", [
		params.owner,
		params.bundleRouter,
		params.presaleTokens,
		params.penaltyBps,
		params.vestingCliff,
		params.vestingDuration,
	]);
	await vault.waitForDeployment();

	return { owner, alice, bob, carol, dave, vault, router, token, routerAddr, params };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PresaleVaultV2 — constructor", () => {
	it("deploys with valid params and starts in OPEN state", async () => {
		const { vault, owner, routerAddr } = await deployFixture();
		assert.equal(await vault.owner(), owner.address);
		assert.equal(await vault.bundleRouter(), routerAddr);
		assert.equal(await vault.presaleTokens(), PRESALE_TOKENS);
		assert.equal(await vault.penaltyBps(), PENALTY_BPS);
		assert.equal(await vault.vestingDuration(), VEST_DURATION);
		assert.equal(await vault.state(), STATE_OPEN);
	});

	it("reverts on zero owner / router / presaleTokens / vestingDuration", async () => {
		const [signer] = await ethers.getSigners();
		const router = await ethers.deployContract("MockBundleRouter");
		const r = await router.getAddress();

		await expectCustomError(
			ethers.deployContract("PresaleVaultV2", [
				ethers.ZeroAddress,
				r,
				PRESALE_TOKENS,
				PENALTY_BPS,
				VEST_CLIFF,
				VEST_DURATION,
			]),
			"InvalidParams",
		);
		await expectCustomError(
			ethers.deployContract("PresaleVaultV2", [
				signer.address,
				ethers.ZeroAddress,
				PRESALE_TOKENS,
				PENALTY_BPS,
				VEST_CLIFF,
				VEST_DURATION,
			]),
			"InvalidParams",
		);
		await expectCustomError(
			ethers.deployContract("PresaleVaultV2", [signer.address, r, 0n, PENALTY_BPS, VEST_CLIFF, VEST_DURATION]),
			"InvalidParams",
		);
		await expectCustomError(
			ethers.deployContract("PresaleVaultV2", [signer.address, r, PRESALE_TOKENS, PENALTY_BPS, VEST_CLIFF, 0n]),
			"InvalidParams",
		);
	});

	it("reverts when penaltyBps is above the 50% cap", async () => {
		const [signer] = await ethers.getSigners();
		const router = await ethers.deployContract("MockBundleRouter");
		const r = await router.getAddress();
		await expectCustomError(
			ethers.deployContract("PresaleVaultV2", [signer.address, r, PRESALE_TOKENS, 5_001n, VEST_CLIFF, VEST_DURATION]),
			"InvalidParams",
		);
	});
});

describe("PresaleVaultV2 — deposit window", () => {
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

describe("PresaleVaultV2 — withdrawal + penalty", () => {
	it("withdraw() applies 5% penalty and refunds 95%", async () => {
		const { vault, alice } = await deployFixture();
		const amount = ethers.parseEther("10");
		await vault.connect(alice).deposit({ value: amount });

		const before = await snapshotBalance(alice.address);
		const tx = await vault.connect(alice).withdraw(amount);
		const receipt = await tx.wait();
		const gas = receipt.gasUsed * receipt.gasPrice;
		const after = await snapshotBalance(alice.address);

		// refund = 95% of 10 BNB = 9.5
		const expectedRefund = ethers.parseEther("9.5");
		assert.equal(after - before + gas, expectedRefund);

		// State updates
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
		// penalty = 4 * 0.05 = 0.2
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

describe("PresaleVaultV2 — close + launch", () => {
	it("only owner can close() and only from OPEN", async () => {
		const { vault, owner, alice } = await deployFixture();
		await expectCustomError(vault.connect(alice).close(), "NotOwner");
		await vault.connect(owner).close();
		await expectCustomError(vault.connect(owner).close(), "InvalidState");
	});

	it("launch() forwards (deposits + bonusPool) BNB to BundleRouter", async () => {
		const { vault, owner, alice, bob, router, token } = await deployFixture();

		await vault.connect(alice).deposit({ value: ethers.parseEther("8") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("4") });
		// Alice withdraws 2 → penalty 0.1 → bonus pool = 0.1, totalDeposited = 10
		await vault.connect(alice).withdraw(ethers.parseEther("2"));

		await vault.connect(owner).close();

		const tokenAddr = await token.getAddress();
		await vault.connect(owner).launch(tokenAddr);

		assert.equal(await vault.state(), STATE_LAUNCHED);
		assert.equal(await vault.token(), tokenAddr);
		assert.equal(await vault.totalDepositedAtLaunch(), ethers.parseEther("10"));
		// router should have received deposits + bonus
		assert.equal(await router.received(), ethers.parseEther("10.1"));
		// vault BNB balance should be 0
		assert.equal(await ethers.provider.getBalance(await vault.getAddress()), 0n);
	});

	it("launch() reverts on bad caller / wrong state / zero token / failing transfer", async () => {
		const { vault, owner, alice, router, token } = await deployFixture();
		const tokenAddr = await token.getAddress();

		// Wrong state (still OPEN)
		await expectCustomError(vault.connect(owner).launch(tokenAddr), "InvalidState");

		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await vault.connect(owner).close();

		// Not owner
		await expectCustomError(vault.connect(alice).launch(tokenAddr), "NotOwner");
		// Zero token
		await expectCustomError(vault.connect(owner).launch(ethers.ZeroAddress), "InvalidParams");

		// Forwarder rejects → LaunchTransferFailed
		await router.setRejectIncoming(true);
		await expectCustomError(vault.connect(owner).launch(tokenAddr), "LaunchTransferFailed");
	});
});

describe("PresaleVaultV2 — vesting + claim", () => {
	async function launchedFixture() {
		const ctx = await deployFixture();
		const { vault, owner, alice, bob, token } = ctx;

		// Alice 6, Bob 4 → totalDeposited 10
		await vault.connect(alice).deposit({ value: ethers.parseEther("6") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("4") });

		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());

		// Fund the vault with the presale tokens (orchestrator step in prod)
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);

		return ctx;
	}

	it("claim before launch reverts (state guard)", async () => {
		const { vault, alice } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await expectCustomError(vault.connect(alice).claim(), "InvalidState");
	});

	it("claim with no deposit reverts (NoDeposit)", async () => {
		const { vault, carol } = await launchedFixture();
		await expectCustomError(vault.connect(carol).claim(), "NoDeposit");
	});

	it("at TGE, exactly 10% of allocation is claimable", async () => {
		const { vault, alice, bob, token } = await launchedFixture();

		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;
		const bobAlloc = (PRESALE_TOKENS * 4n) / 10n;

		// alice claim at TGE (right after launch — vestedPct = 1000 + 0 = 10%)
		await vault.connect(alice).claim();
		assert.equal(await token.balanceOf(alice.address), aliceAlloc / 10n);

		await vault.connect(bob).claim();
		assert.equal(await token.balanceOf(bob.address), bobAlloc / 10n);
	});

	it("at half vesting, ~55% claimable (10% TGE + half of 90%)", async () => {
		const { vault, alice, token } = await launchedFixture();
		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;

		await increaseTime(VEST_DURATION / 2n);
		await vault.connect(alice).claim();

		// Expect roughly 55% (10% + 45%). Allow tiny drift for block timestamp slop.
		const got = await token.balanceOf(alice.address);
		const expected = (aliceAlloc * 55n) / 100n;
		const tolerance = aliceAlloc / 1_000n; // 0.1%
		const diff = got > expected ? got - expected : expected - got;
		assert.ok(diff <= tolerance, `claim drift too large: got=${got} expected=${expected}`);
	});

	it("at full vesting, 100% claimable", async () => {
		const { vault, alice, token } = await launchedFixture();
		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;

		await increaseTime(VEST_DURATION + 1n);
		await vault.connect(alice).claim();
		assert.equal(await token.balanceOf(alice.address), aliceAlloc);
	});

	it("incremental claims sum to allocation; double-claim reverts NothingToClaim", async () => {
		const { vault, alice, token } = await launchedFixture();
		const aliceAlloc = (PRESALE_TOKENS * 6n) / 10n;

		// First claim at TGE
		await vault.connect(alice).claim();
		const afterTge = await token.balanceOf(alice.address);
		assert.equal(afterTge, aliceAlloc / 10n);

		// Immediately try again — block timestamp barely moved, vested unchanged.
		await expectCustomError(vault.connect(alice).claim(), "NothingToClaim");

		// After full vesting, claim again — total should equal allocation.
		await increaseTime(VEST_DURATION + 1n);
		await vault.connect(alice).claim();
		assert.equal(await token.balanceOf(alice.address), aliceAlloc);
	});

	it("two depositors share 100% of presaleTokens after full vesting", async () => {
		const { vault, alice, bob, token } = await launchedFixture();

		await increaseTime(VEST_DURATION + 1n);
		await vault.connect(alice).claim();
		await vault.connect(bob).claim();

		const total = (await token.balanceOf(alice.address)) + (await token.balanceOf(bob.address));
		// Allow 1 wei rounding tolerance from integer division.
		const diff = total > PRESALE_TOKENS ? total - PRESALE_TOKENS : PRESALE_TOKENS - total;
		assert.ok(diff <= 1n, `pro-rata totals diverge: ${diff}`);
	});

	it("single-depositor edge case gets the entire presaleTokens supply", async () => {
		const { vault, owner, alice, token } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("3") });
		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);

		await increaseTime(VEST_DURATION + 1n);
		await vault.connect(alice).claim();
		assert.equal(await token.balanceOf(alice.address), PRESALE_TOKENS);
	});

	it("claim reverts TokenBalanceTooLow if vault wasn't funded", async () => {
		const { vault, owner, alice, token } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());
		// Skip the mint step intentionally.

		await increaseTime(VEST_DURATION + 1n);
		await expectCustomError(vault.connect(alice).claim(), "TokenBalanceTooLow");
	});

	it("respects vestingCliff before unlocking anything", async () => {
		const cliff = 7n * 24n * 60n * 60n; // 7 days
		const ctx = await deployFixture({ vestingCliff: cliff });
		const { vault, owner, alice, token } = ctx;

		await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);

		// Before cliff → NothingToClaim.
		await expectCustomError(vault.connect(alice).claim(), "NothingToClaim");

		// Fast forward past cliff → 10% TGE unlocks.
		await increaseTime(cliff + 1n);
		await vault.connect(alice).claim();
		// Approx 10% (small drift OK from block timestamp).
		const bal = await token.balanceOf(alice.address);
		const expected = PRESALE_TOKENS / 10n;
		const tolerance = PRESALE_TOKENS / 100_000n; // 0.001%
		const diff = bal > expected ? bal - expected : expected - bal;
		assert.ok(diff <= tolerance, `cliff TGE drift too large: got=${bal} expected=${expected}`);
	});
});

describe("PresaleVaultV2 — view + accounting invariants", () => {
	it("getDepositorInfo + getPresaleInfo return consistent values pre/post launch", async () => {
		const { vault, owner, alice, bob, token } = await deployFixture();
		await vault.connect(alice).deposit({ value: ethers.parseEther("2") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("3") });
		await vault.connect(alice).withdraw(ethers.parseEther("1"));

		// Pre-launch
		const preInfo = await vault.getPresaleInfo();
		assert.equal(preInfo.currentState, STATE_OPEN);
		assert.equal(preInfo.totalDeposited_, ethers.parseEther("4"));
		assert.equal(preInfo.bonusPool_, ethers.parseEther("0.05"));
		assert.equal(preInfo.depositorCount_, 2n);

		const aliceInfo = await vault.getDepositorInfo(alice.address);
		assert.equal(aliceInfo.deposited, ethers.parseEther("1"));
		// Pre-launch allocation uses live totalDeposited; vested = 0.
		assert.equal(aliceInfo.totalTokens, (PRESALE_TOKENS * 1n) / 4n);
		assert.equal(aliceInfo.vested, 0n);
		assert.equal(aliceInfo.claimable, 0n);

		await vault.connect(owner).close();
		await vault.connect(owner).launch(await token.getAddress());
		await token.mint(await vault.getAddress(), PRESALE_TOKENS);

		const postInfo = await vault.getPresaleInfo();
		assert.equal(postInfo.currentState, STATE_LAUNCHED);
		assert.notEqual(postInfo.launchTimestamp_, 0n);

		// Post-launch allocation uses snapshot, equals totalDeposited at launch (4).
		const aliceAfter = await vault.getDepositorInfo(alice.address);
		assert.equal(aliceAfter.totalTokens, (PRESALE_TOKENS * 1n) / 4n);
	});

	it("BNB conservation: sum(refunds + bonusPool) == sum(net deposits)", async () => {
		const { vault, alice, bob, carol } = await deployFixture();

		// Deposit
		await vault.connect(alice).deposit({ value: ethers.parseEther("5") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("3") });
		await vault.connect(carol).deposit({ value: ethers.parseEther("2") });

		// Withdrawals
		await vault.connect(alice).withdraw(ethers.parseEther("2")); // refund 1.9, penalty 0.1
		await vault.connect(bob).withdrawAll(); // refund 2.85, penalty 0.15

		// Total deposited gross: 10 BNB
		// Withdrawn gross: 5 BNB → refunded 4.75, penalty 0.25
		// Vault should hold: deposits remaining (5) + bonusPool (0.25) = 5.25 BNB
		const vaultAddr = await vault.getAddress();
		const bal = await ethers.provider.getBalance(vaultAddr);
		assert.equal(bal, ethers.parseEther("5.25"));

		assert.equal(await vault.totalDeposited(), ethers.parseEther("5"));
		assert.equal(await vault.bonusPool(), ethers.parseEther("0.25"));
	});
});
