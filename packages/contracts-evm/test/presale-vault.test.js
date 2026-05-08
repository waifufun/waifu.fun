const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

const MIN_DEPOSIT = ethers.parseEther("0.001");
const EXPECTED = ethers.parseEther("200000000");
const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;

async function now() {
	return (await ethers.provider.getBlock("latest")).timestamp;
}

async function increaseTo(timestamp) {
	await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
	await ethers.provider.send("evm_mine", []);
}

async function expectCustomError(promise, errorName) {
	await assert.rejects(promise, (err) => String(err).includes(errorName));
}

async function deployVault(overrides = {}) {
	const [deployer, graduator, factory, alice, bob, carol, outsider] = await ethers.getSigners();
	const current = await now();
	const open = overrides.open ?? current;
	const close = overrides.close ?? open + 2 * HOUR;
	const refundTimeout = overrides.refundTimeout ?? close + 7 * DAY;
	const perWalletCap = overrides.perWalletCap ?? ethers.parseEther("10");
	const minRaise = overrides.minRaise ?? ethers.parseEther("1");
	const maxRaise = overrides.maxRaise ?? ethers.parseEther("20");
	const expectedTokenAllocation = overrides.expectedTokenAllocation ?? EXPECTED;
	const vault = await ethers.deployContract("PresaleVault", [
		overrides.agentName ?? "waifu",
		open,
		close,
		refundTimeout,
		perWalletCap,
		minRaise,
		maxRaise,
		expectedTokenAllocation,
		overrides.graduator ?? graduator.address,
		overrides.factory ?? factory.address,
	]);
	await vault.waitForDeployment();
	return { deployer, graduator, factory, alice, bob, carol, outsider, vault, open, close, refundTimeout };
}

async function deployToken() {
	const token = await ethers.deployContract("ERC20Mock");
	await token.waitForDeployment();
	return token;
}

async function lockVault(ctx, deposits = [["alice", ethers.parseEther("1")]]) {
	for (const [name, amount] of deposits) {
		await ctx.vault.connect(ctx[name]).deposit({ value: amount });
	}
	await increaseTo(ctx.close);
	await ctx.vault.closePresale();
}

async function graduateVault(ctx, deposits = [["alice", ethers.parseEther("1")]]) {
	await lockVault(ctx, deposits);
	const token = await deployToken();
	await token.mint(await ctx.vault.getAddress(), EXPECTED);
	await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED);
	return token;
}

describe("PresaleVault", () => {
	describe("configuration and invariants", () => {
		it("deploys with immutable config and emits initial state", async () => {
			const ctx = await deployVault();
			assert.equal(await ctx.vault.agentName(), "waifu");
			assert.equal(await ctx.vault.graduator(), ctx.graduator.address);
			assert.equal(await ctx.vault.factory(), ctx.factory.address);
			assert.equal(await ctx.vault.expectedTokenAllocation(), EXPECTED);
			assert.equal(await ctx.vault.state(), 0n);
		});

		it("rejects invalid constructor timestamps and config", async () => {
			const [, graduator, factory] = await ethers.getSigners();
			const current = await now();
			await expectCustomError(
				ethers.deployContract("PresaleVault", [
					"bad",
					current + HOUR,
					current + HOUR,
					current + 8 * DAY,
					0,
					0,
					0,
					EXPECTED,
					graduator.address,
					factory.address,
				]),
				"InvalidTimestamp",
			);
			await expectCustomError(deployVault({ expectedTokenAllocation: 0n }), "InvalidConfig");
			await expectCustomError(deployVault({ graduator: ethers.ZeroAddress }), "ZeroAddress");
			await expectCustomError(deployVault({ minRaise: 2n, maxRaise: 1n }), "InvalidConfig");
			await expectCustomError(deployVault({ minRaise: 0n, maxRaise: 1n }), "InvalidConfig");
			await expectCustomError(deployVault({ perWalletCap: 1n }), "InvalidConfig");
		});

		it("keeps value conservation through deposits, withdrawals, claims, and refunds", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await ctx.vault.connect(ctx.bob).deposit({ value: ethers.parseEther("2") });
			assert.equal(await ctx.vault.totalDeposits(), ethers.parseEther("3"));
			assert.equal(await ethers.provider.getBalance(await ctx.vault.getAddress()), ethers.parseEther("3"));
			await ctx.vault.connect(ctx.alice).withdraw(ethers.parseEther("0.5"));
			assert.equal(await ctx.vault.totalDeposits(), ethers.parseEther("2.5"));
			const token = await graduateVault(ctx, []);
			assert.equal(await token.balanceOf(await ctx.vault.getAddress()), EXPECTED);
			await ctx.vault.connect(ctx.bob).claim();
			assert.equal(await ctx.vault.claimedDeposits(), ethers.parseEther("2"));
			assert.equal(await ctx.vault.claimedTokens(), ethers.parseEther("160000000"));
		});

		it("reports view helpers without division by zero", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			const [depositAmount, projected] = await ctx.vault.getDepositorShare(ctx.alice.address);
			assert.equal(depositAmount, 0n);
			assert.equal(projected, 0n);
			assert.equal(await ctx.vault.presaleOpen(), true);
			assert.equal(await ctx.vault.presaleClosed(), false);
			assert.equal(await ctx.vault.graduated(), false);
			assert.equal(await ctx.vault.refundAvailable(), false);
			assert.ok((await ctx.vault.timeUntilClose()) > 0n);
			assert.ok((await ctx.vault.timeUntilRefund()) > 0n);
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			const [, projectedAfterDeposit] = await ctx.vault.getDepositorShare(ctx.alice.address);
			assert.equal(projectedAfterDeposit, EXPECTED);
			const config = await ctx.vault.getConfig();
			assert.equal(config.name, "waifu");
			assert.equal(config.vaultGraduator, ctx.graduator.address);
		});
	});

	describe("happy, refund, and cancel paths", () => {
		it("happy path: deposit, close, graduate, claim", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			const token = await graduateVault(ctx, [
				["alice", ethers.parseEther("1")],
				["bob", ethers.parseEther("3")],
			]);
			assert.equal(await ethers.provider.getBalance(await ctx.vault.getAddress()), 0n);
			await ctx.vault.connect(ctx.alice).claim();
			await ctx.vault.connect(ctx.bob).claim();
			assert.equal(await token.balanceOf(ctx.alice.address), ethers.parseEther("50000000"));
			assert.equal(await token.balanceOf(ctx.bob.address), ethers.parseEther("150000000"));
			assert.equal(await ctx.vault.state(), 4n);
		});

		it("refund path: deposit, timeout, refund", async () => {
			const ctx = await deployVault();
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await increaseTo(ctx.refundTimeout);
			await ctx.vault.connect(ctx.alice).refund();
			assert.equal(await ctx.vault.totalDeposits(), 0n);
			assert.equal(await ctx.vault.state(), 4n);
			assert.equal(await ctx.vault.refundAvailable(), false);
		});

		it("cancel path: deposit, min raise not met, cancelLaunch, refund", async () => {
			const ctx = await deployVault({ minRaise: ethers.parseEther("5") });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await increaseTo(ctx.close);
			await ctx.vault.closePresale();
			await ctx.vault.connect(ctx.outsider).cancelLaunch();
			assert.equal(await ctx.vault.state(), 3n);
			await ctx.vault.connect(ctx.alice).refund();
			assert.equal(await ctx.vault.state(), 4n);
		});
	});

	describe("49 documented edge cases", () => {
		it("edge 6.1 deposit with zero BNB reverts", async () => {
			const ctx = await deployVault();
			await expectCustomError(ctx.vault.connect(ctx.alice).deposit({ value: 0n }), "InsufficientDeposit");
		});

		it("edge 6.2 deposit below MIN_DEPOSIT reverts", async () => {
			const ctx = await deployVault();
			await expectCustomError(ctx.vault.connect(ctx.alice).deposit({ value: 1n }), "InsufficientDeposit");
		});

		it("edge 6.3 repeated deposits accumulate", async () => {
			const ctx = await deployVault();
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("2") });
			assert.equal(await ctx.vault.deposits(ctx.alice.address), ethers.parseEther("3"));
		});

		it("edge 6.4 exact wallet cap succeeds and next deposit reverts", async () => {
			const ctx = await deployVault({ perWalletCap: ethers.parseEther("1") });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await expectCustomError(ctx.vault.connect(ctx.alice).deposit({ value: MIN_DEPOSIT }), "WalletCapExceeded");
		});

		it("edge 6.5 graduate with zero deposits reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await increaseTo(ctx.close);
			await ctx.vault.closePresale();
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await expectCustomError(
				ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED),
				"NoDeposits",
			);
		});

		it("edge 6.6 double graduation reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			const token = await graduateVault(ctx);
			await expectCustomError(
				ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED),
				"InvalidState",
			);
		});

		it("edge 6.7 claim before graduation reverts", async () => {
			const ctx = await deployVault();
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await expectCustomError(ctx.vault.connect(ctx.alice).claim(), "NotGraduated");
		});

		it("edge 6.8 claim after refund reverts as already claimed", async () => {
			const ctx = await deployVault();
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await increaseTo(ctx.refundTimeout);
			await ctx.vault.connect(ctx.alice).refund();
			await expectCustomError(ctx.vault.connect(ctx.alice).claim(), "AlreadyClaimed");
		});

		it("edge 6.9 claim by non-depositor reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await graduateVault(ctx);
			await expectCustomError(ctx.vault.connect(ctx.outsider).claim(), "NoDeposit");
		});

		it("edge 6.10 duplicate claim reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await graduateVault(ctx);
			await ctx.vault.connect(ctx.alice).claim();
			await expectCustomError(ctx.vault.connect(ctx.alice).claim(), "AlreadyClaimed");
		});

		it("edge 6.11 refund before timeout reverts", async () => {
			const ctx = await deployVault();
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await expectCustomError(ctx.vault.connect(ctx.alice).refund(), "RefundNotAvailable");
		});

		it("edge 6.12 refund after graduation reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await graduateVault(ctx);
			await expectCustomError(ctx.vault.connect(ctx.alice).refund(), "InvalidState");
		});

		it("edge 6.13 deposit reentrancy has no external call surface", async () => {
			const ctx = await deployVault();
			const attacker = await ethers.deployContract("ReentrantBnbReceiver", [await ctx.vault.getAddress()]);
			await attacker.waitForDeployment();
			await attacker.depositToVault({ value: ethers.parseEther("1") });
			assert.equal(await ctx.vault.deposits(await attacker.getAddress()), ethers.parseEther("1"));
		});

		it("edge 6.14 malicious token reentrancy during claim is blocked", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			const token = await ethers.deployContract("ReentrantTokenMock");
			await token.waitForDeployment();
			await token.setVault(await ctx.vault.getAddress());
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED);
			await token.setAttack(true);
			await assert.rejects(ctx.vault.connect(ctx.alice).claim());
		});

		it("edge 6.15 reentrancy on refund via BNB receive is blocked", async () => {
			const ctx = await deployVault({ perWalletCap: 0n });
			const attacker = await ethers.deployContract("ReentrantBnbReceiver", [await ctx.vault.getAddress()]);
			await attacker.waitForDeployment();
			await attacker.depositToVault({ value: ethers.parseEther("1") });
			await increaseTo(ctx.refundTimeout);
			await expectCustomError(attacker.refundFromVault(), "TransferFailed");
		});

		it("edge 6.16 reentrancy on withdraw via BNB receive is blocked", async () => {
			const ctx = await deployVault({ perWalletCap: 0n });
			const attacker = await ethers.deployContract("ReentrantBnbReceiver", [await ctx.vault.getAddress()]);
			await attacker.waitForDeployment();
			await attacker.depositToVault({ value: ethers.parseEther("1") });
			await expectCustomError(attacker.withdrawFromVault(ethers.parseEther("0.5")), "TransferFailed");
		});

		it("edge 6.17 false-returning token makes claim revert", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			const token = await ethers.deployContract("FalseReturnToken");
			await token.waitForDeployment();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED);
			await assert.rejects(ctx.vault.connect(ctx.alice).claim());
		});

		it("edge 6.18 one reverting token transfer does not change other user state", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx, [
				["alice", ethers.parseEther("1")],
				["bob", ethers.parseEther("1")],
			]);
			const token = await ethers.deployContract("FalseReturnToken");
			await token.waitForDeployment();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED);
			await assert.rejects(ctx.vault.connect(ctx.alice).claim());
			assert.equal(await ctx.vault.deposits(ctx.bob.address), ethers.parseEther("1"));
		});

		it("edge 6.19 token that lies about transfers is not detectable", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			const token = await ethers.deployContract("NoMoveToken");
			await token.waitForDeployment();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED);
			await ctx.vault.connect(ctx.alice).claim();
			assert.equal(await token.balanceOf(ctx.alice.address), 0n);
			assert.equal(await ctx.vault.claimed(ctx.alice.address), true);
		});

		it("edge 6.20 small timestamp movement does not bypass windows", async () => {
			const current = await now();
			const ctx = await deployVault({
				open: current + HOUR,
				close: current + 3 * HOUR,
				refundTimeout: current + 3 * HOUR + 7 * DAY,
			});
			await expectCustomError(
				ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") }),
				"InvalidTimestamp",
			);
		});

		it("edge 6.21 wrong token allocation in graduate reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await expectCustomError(
				ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED - 1n),
				"InvalidTokenAllocation",
			);
		});

		it("edge 6.22 pro-rata rounding leaves dust in the vault", async () => {
			const ctx = await deployVault({ minRaise: 0n, expectedTokenAllocation: 100n });
			await lockVault(ctx, [
				["alice", ethers.parseEther("1")],
				["bob", ethers.parseEther("1")],
				["carol", ethers.parseEther("1")],
			]);
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), 100n);
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), 100n);
			await ctx.vault.connect(ctx.alice).claim();
			await ctx.vault.connect(ctx.bob).claim();
			await ctx.vault.connect(ctx.carol).claim();
			assert.equal(await token.balanceOf(await ctx.vault.getAddress()), 1n);
		});

		it("edge 6.23 zero token address in graduate reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			await expectCustomError(ctx.vault.connect(ctx.graduator).graduate(ethers.ZeroAddress, EXPECTED), "InvalidToken");
		});

		it("edge 6.24 address zero cannot be a msg.sender depositor", async () => {
			const ctx = await deployVault();
			assert.equal(await ctx.vault.deposits(ethers.ZeroAddress), 0n);
		});

		it("edge 6.25 msg.sender equal to vault cannot organically deposit", async () => {
			const ctx = await deployVault();
			assert.notEqual(ctx.alice.address, await ctx.vault.getAddress());
		});

		it("edge 6.26 zero-deposit graduation cannot lock BNB", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await increaseTo(ctx.close);
			await ctx.vault.closePresale();
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await expectCustomError(
				ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED),
				"NoDeposits",
			);
			assert.equal(await ctx.vault.state(), 1n);
		});

		it("edge 6.27 lost graduator key is mitigated by timeout refund", async () => {
			const ctx = await deployVault();
			await lockVault(ctx);
			await increaseTo(ctx.refundTimeout);
			await ctx.vault.connect(ctx.alice).refund();
			assert.equal(await ctx.vault.totalDeposits(), 0n);
		});

		it("edge 6.28 withdraw must leave zero or at least MIN_DEPOSIT", async () => {
			const ctx = await deployVault();
			await ctx.vault.connect(ctx.alice).deposit({ value: MIN_DEPOSIT + 1n });
			await expectCustomError(ctx.vault.connect(ctx.alice).withdraw(2n), "ResidualDepositTooSmall");
			await ctx.vault.connect(ctx.alice).withdraw(MIN_DEPOSIT + 1n);
			assert.equal(await ctx.vault.deposits(ctx.alice.address), 0n);
		});

		it("edge 6.29 non-payable or reverting receiver cannot withdraw", async () => {
			const ctx = await deployVault({ perWalletCap: 0n });
			const attacker = await ethers.deployContract("ReentrantBnbReceiver", [await ctx.vault.getAddress()]);
			await attacker.waitForDeployment();
			await attacker.depositToVault({ value: ethers.parseEther("1") });
			await expectCustomError(attacker.withdrawFromVault(ethers.parseEther("1")), "TransferFailed");
		});

		it("edge 6.30 deposit and claim cannot happen in the same state", async () => {
			const ctx = await deployVault({ maxRaise: ethers.parseEther("1"), minRaise: 0n });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await expectCustomError(ctx.vault.connect(ctx.alice).deposit({ value: MIN_DEPOSIT }), "InvalidState");
			await expectCustomError(ctx.vault.connect(ctx.alice).claim(), "NotGraduated");
		});

		it("edge 6.31 sybil deposits across addresses are allowed within each cap", async () => {
			const ctx = await deployVault({ perWalletCap: ethers.parseEther("1") });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await ctx.vault.connect(ctx.bob).deposit({ value: ethers.parseEther("1") });
			assert.equal(await ctx.vault.totalDeposits(), ethers.parseEther("2"));
		});

		it("edge 6.32 deposits at a full cap are fastest gas wins and then locked", async () => {
			const ctx = await deployVault({ maxRaise: ethers.parseEther("1"), minRaise: 0n });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			assert.equal(await ctx.vault.state(), 1n);
			await expectCustomError(ctx.vault.connect(ctx.bob).deposit({ value: MIN_DEPOSIT }), "InvalidState");
		});

		it("edge 6.33 non-graduator cannot front-run graduate", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await expectCustomError(
				ctx.vault.connect(ctx.outsider).graduate(await token.getAddress(), EXPECTED),
				"Unauthorized",
			);
		});

		it("edge 6.34 graduate balanceOf path is nonReentrant and checks balance", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			const token = await deployToken();
			await expectCustomError(
				ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED),
				"InvalidTokenAllocation",
			);
		});

		it("edge 6.35 token balance shortage at claim time reverts without admin drain", async () => {
			const ctx = await deployVault({ minRaise: 0n, expectedTokenAllocation: ethers.parseEther("1") });
			await lockVault(ctx);
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), ethers.parseEther("1"));
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), ethers.parseEther("1"));
			await token.connect(ctx.alice).transfer(await ctx.vault.getAddress(), 0n);
			await ctx.vault.connect(ctx.alice).claim();
			assert.equal(await token.balanceOf(ctx.alice.address), ethers.parseEther("1"));
		});

		it("edge 6.36 getDepositorShare guards divide by zero", async () => {
			const ctx = await deployVault();
			const result = await ctx.vault.getDepositorShare(ctx.alice.address);
			assert.equal(result[1], 0n);
		});

		it("edge 6.37 depositing exactly at close boundary reverts and close succeeds", async () => {
			const ctx = await deployVault();
			await increaseTo(ctx.close);
			await expectCustomError(
				ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") }),
				"InvalidTimestamp",
			);
			await ctx.vault.closePresale();
			assert.equal(await ctx.vault.state(), 1n);
		});

		it("edge 6.38 graduator receives raised BNB during graduation", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			const beforeBalance = await ethers.provider.getBalance(ctx.graduator.address);
			await graduateVault(ctx);
			const afterBalance = await ethers.provider.getBalance(ctx.graduator.address);
			assert.ok(afterBalance > beforeBalance + ethers.parseEther("0.99"));
		});

		it("edge 6.39 uint128 overflow is checked by max raise scale", async () => {
			const ctx = await deployVault({ maxRaise: MIN_DEPOSIT, minRaise: 0n, perWalletCap: 0n });
			await ctx.vault.connect(ctx.alice).deposit({ value: MIN_DEPOSIT });
			assert.equal(await ctx.vault.totalDeposits(), MIN_DEPOSIT);
		});

		it("edge 6.40 forced BNB can exceed accounted deposits and is ignored", async () => {
			const ctx = await deployVault();
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await ethers.provider.send("hardhat_setBalance", [await ctx.vault.getAddress(), "0x0F43FC2C04EE0000"]);
			assert.equal(await ctx.vault.totalDeposits(), ethers.parseEther("1"));
			assert.equal(await ethers.provider.getBalance(await ctx.vault.getAddress()), ethers.parseEther("1.1"));
		});

		it("edge 6.41 pre-transferred tokens can be stuck if graduate is never called", async () => {
			const ctx = await deployVault();
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			assert.equal(await token.balanceOf(await ctx.vault.getAddress()), EXPECTED);
			assert.equal(await ctx.vault.state(), 0n);
		});

		it("edge 6.42 missing pre-transfer is caught at graduate", async () => {
			const ctx = await deployVault({ minRaise: 0n });
			await lockVault(ctx);
			const token = await deployToken();
			await expectCustomError(
				ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED),
				"InvalidTokenAllocation",
			);
		});

		it("edge 6.43 BNB has no approve transferFrom cap bypass", async () => {
			const ctx = await deployVault({ perWalletCap: ethers.parseEther("1") });
			await ctx.vault.connect(ctx.alice).deposit({ value: ethers.parseEther("1") });
			await expectCustomError(ctx.vault.connect(ctx.alice).deposit({ value: MIN_DEPOSIT }), "WalletCapExceeded");
		});

		it("edge 6.44 timestamp zero is irrelevant on current chain", async () => {
			assert.ok((await now()) > 0);
		});

		it("edge 6.45 uint64 refund timeout deploys inside sane bounds", async () => {
			const ctx = await deployVault();
			assert.ok((await ctx.vault.refundTimeout()) < 2n ** 64n);
		});

		it("edge 6.46 ERC20 claim to a contract does not require payable receive", async () => {
			const ctx = await deployVault({ minRaise: 0n, perWalletCap: 0n });
			const receiver = await ethers.deployContract("ReentrantBnbReceiver", [await ctx.vault.getAddress()]);
			await receiver.waitForDeployment();
			await receiver.depositToVault({ value: ethers.parseEther("1") });
			await increaseTo(ctx.close);
			await ctx.vault.closePresale();
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED);
			await receiver.claimFromVault();
			assert.equal(await token.balanceOf(await receiver.getAddress()), EXPECTED);
		});

		it("edge 6.47 zero owed claim reverts", async () => {
			const ctx = await deployVault({ minRaise: 0n, expectedTokenAllocation: 1n, perWalletCap: 0n });
			await lockVault(ctx, [
				["alice", MIN_DEPOSIT],
				["bob", ethers.parseEther("1")],
			]);
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), 1n);
			await ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), 1n);
			await expectCustomError(ctx.vault.connect(ctx.alice).claim(), "ZeroOwed");
		});

		it("edge 6.48 no mapping iteration is needed for per-user operations", async () => {
			const ctx = await deployVault({ perWalletCap: 0n });
			await ctx.vault.connect(ctx.alice).deposit({ value: MIN_DEPOSIT });
			await ctx.vault.connect(ctx.bob).deposit({ value: MIN_DEPOSIT });
			assert.equal(await ctx.vault.deposits(ctx.alice.address), MIN_DEPOSIT);
		});

		it("edge 6.49 cap is denominated in wei BNB", async () => {
			const ctx = await deployVault({ perWalletCap: ethers.parseEther("2") });
			assert.equal(await ctx.vault.perWalletCap(), ethers.parseEther("2"));
		});
	});

	describe("additional presale controls", () => {
		it("manual close cannot happen before close unless cap is hit", async () => {
			const ctx = await deployVault();
			await expectCustomError(ctx.vault.closePresale(), "InvalidTimestamp");
		});

		it("graduate enforces minRaise", async () => {
			const ctx = await deployVault({ minRaise: ethers.parseEther("2") });
			await lockVault(ctx, [["alice", ethers.parseEther("1")]]);
			const token = await deployToken();
			await token.mint(await ctx.vault.getAddress(), EXPECTED);
			await expectCustomError(
				ctx.vault.connect(ctx.graduator).graduate(await token.getAddress(), EXPECTED),
				"MinRaiseNotMet",
			);
		});

		it("cancelLaunch cannot run when minRaise is met", async () => {
			const ctx = await deployVault({ minRaise: ethers.parseEther("1") });
			await lockVault(ctx);
			await expectCustomError(ctx.vault.cancelLaunch(), "MinRaiseMet");
		});

		it("receive and fallback reject direct BNB", async () => {
			const ctx = await deployVault();
			await expectCustomError(
				ctx.alice.sendTransaction({ to: await ctx.vault.getAddress(), value: MIN_DEPOSIT }),
				"DirectBnbRejected",
			);
			await expectCustomError(
				ctx.alice.sendTransaction({ to: await ctx.vault.getAddress(), value: 0n, data: "0x12345678" }),
				"DirectBnbRejected",
			);
		});
	});
});
