// Wave M1: TaxSplitter test matrix.
//
// Covers:
//   - Constructor validation (BPS bounds, zero addresses)
//   - Default 10/25/65 split, rounding goes to agent remainder
//   - 100% to single recipient (edge BPS configs)
//   - Native BNB split + receive() acceptance
//   - ERC20 split with normal + fee-on-transfer tokens
//   - Idempotent / no-op on zero balance (no event)
//   - splitMany convenience
//   - Reentrancy safety (malicious receiver cannot drain)

const { expect } = require("chai");
const { ethers } = require("hardhat");

const BPS = 10000n;

async function deploySplitter(platformBps, patronBps, platform, patron, agent) {
	const Splitter = await ethers.getContractFactory("TaxSplitter");
	return Splitter.deploy(
		platform.address ?? platform,
		patron.address ?? patron,
		agent.address ?? agent,
		platformBps,
		patronBps,
	);
}

describe("TaxSplitter (wave M1)", () => {
	let owner;
	let platform;
	let patron;
	let agent;
	let other;

	beforeEach(async () => {
		[owner, platform, patron, agent, other] = await ethers.getSigners();
	});

	describe("constructor", () => {
		it("reverts on zero address (platform)", async () => {
			const Splitter = await ethers.getContractFactory("TaxSplitter");
			await expect(
				Splitter.deploy(ethers.ZeroAddress, patron.address, agent.address, 1000, 2500),
			).to.be.revertedWithCustomError(Splitter, "ZeroAddress");
		});

		it("reverts on zero address (patron)", async () => {
			const Splitter = await ethers.getContractFactory("TaxSplitter");
			await expect(
				Splitter.deploy(platform.address, ethers.ZeroAddress, agent.address, 1000, 2500),
			).to.be.revertedWithCustomError(Splitter, "ZeroAddress");
		});

		it("reverts on zero address (agent)", async () => {
			const Splitter = await ethers.getContractFactory("TaxSplitter");
			await expect(
				Splitter.deploy(platform.address, patron.address, ethers.ZeroAddress, 1000, 2500),
			).to.be.revertedWithCustomError(Splitter, "ZeroAddress");
		});

		it("reverts when platformBps < 1000 (MIN_PLATFORM_CUT)", async () => {
			const Splitter = await ethers.getContractFactory("TaxSplitter");
			await expect(
				Splitter.deploy(platform.address, patron.address, agent.address, 999, 2500),
			).to.be.revertedWithCustomError(Splitter, "InvalidBps");
		});

		it("reverts when platformBps > 5000 (MAX_PLATFORM_CUT)", async () => {
			const Splitter = await ethers.getContractFactory("TaxSplitter");
			await expect(
				Splitter.deploy(platform.address, patron.address, agent.address, 5001, 2500),
			).to.be.revertedWithCustomError(Splitter, "InvalidBps");
		});

		it("reverts when platformBps + patronBps > 10000", async () => {
			const Splitter = await ethers.getContractFactory("TaxSplitter");
			await expect(
				Splitter.deploy(platform.address, patron.address, agent.address, 5000, 5001),
			).to.be.revertedWithCustomError(Splitter, "InvalidBps");
		});

		it("computes agentBps as the remainder (10/25/65 default)", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			expect(await s.platformBps()).to.equal(1000);
			expect(await s.patronBps()).to.equal(2500);
			expect(await s.agentBps()).to.equal(6500);
		});

		it("accepts platformBps == MAX_PLATFORM_CUT (5000) with patron = 0", async () => {
			const s = await deploySplitter(5000, 0, platform, patron, agent);
			expect(await s.agentBps()).to.equal(5000);
		});

		it("accepts platformBps == 10000 case via boundary (100% platform)", async () => {
			// platformBps == 10000 violates MAX_PLATFORM_CUT (5000). So 100% platform isn't
			// allowed by design; verify revert.
			const Splitter = await ethers.getContractFactory("TaxSplitter");
			await expect(
				Splitter.deploy(platform.address, patron.address, agent.address, 10000, 0),
			).to.be.revertedWithCustomError(Splitter, "InvalidBps");
		});

		it("stores immutable addresses and getters work", async () => {
			const s = await deploySplitter(1500, 3000, platform, patron, agent);
			expect(await s.platform()).to.equal(platform.address);
			expect(await s.patron()).to.equal(patron.address);
			expect(await s.agent()).to.equal(agent.address);
			expect(await s.platformBps()).to.equal(1500);
			expect(await s.patronBps()).to.equal(3000);
			expect(await s.agentBps()).to.equal(5500);
		});

		it("exposes BPS constants", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			expect(await s.BPS_DENOM()).to.equal(10000);
			expect(await s.MIN_PLATFORM_CUT()).to.equal(1000);
			expect(await s.MAX_PLATFORM_CUT()).to.equal(5000);
		});
	});

	describe("split() - native BNB", () => {
		it("splits 10/25/65 default and sums to total", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			const amt = ethers.parseEther("10");
			await owner.sendTransaction({ to: await s.getAddress(), value: amt });

			const p0 = await ethers.provider.getBalance(platform.address);
			const pa0 = await ethers.provider.getBalance(patron.address);
			const ag0 = await ethers.provider.getBalance(agent.address);

			await expect(s.connect(other).split())
				.to.emit(s, "Split")
				.withArgs(ethers.ZeroAddress, ethers.parseEther("1"), ethers.parseEther("2.5"), ethers.parseEther("6.5"));

			expect((await ethers.provider.getBalance(platform.address)) - p0).to.equal(ethers.parseEther("1"));
			expect((await ethers.provider.getBalance(patron.address)) - pa0).to.equal(ethers.parseEther("2.5"));
			expect((await ethers.provider.getBalance(agent.address)) - ag0).to.equal(ethers.parseEther("6.5"));
			expect(await ethers.provider.getBalance(await s.getAddress())).to.equal(0);
		});

		it("rounds remainder to agent (no wei stranded)", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			// 7 wei: platform = 7*1000/10000 = 0, patron = 7*2500/10000 = 1, agent = 7-0-1 = 6
			await owner.sendTransaction({ to: await s.getAddress(), value: 7n });

			const tx = await s.connect(other).split();
			await expect(tx).to.emit(s, "Split").withArgs(ethers.ZeroAddress, 0n, 1n, 6n);
			expect(await ethers.provider.getBalance(await s.getAddress())).to.equal(0);
		});

		it("is a no-op on zero balance (no event, no revert)", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			const tx = await s.connect(other).split();
			const rcpt = await tx.wait();
			// No Split event should be emitted
			const evt = rcpt.logs.find((l) => {
				try {
					return s.interface.parseLog(l)?.name === "Split";
				} catch {
					return false;
				}
			});
			expect(evt).to.equal(undefined);
		});

		it("is idempotent: second call after drain is also a no-op", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			await owner.sendTransaction({ to: await s.getAddress(), value: ethers.parseEther("1") });
			await s.split();
			// second call - balance is 0
			await s.split();
			expect(await ethers.provider.getBalance(await s.getAddress())).to.equal(0);
		});

		it("100% to platform when patron = 0 and agent gets nothing if platform = 5000 + agent gets 5000", async () => {
			// Edge: max platform cut (5000), patron 0 → agent 5000
			const s = await deploySplitter(5000, 0, platform, patron, agent);
			await owner.sendTransaction({ to: await s.getAddress(), value: ethers.parseEther("4") });
			const p0 = await ethers.provider.getBalance(platform.address);
			const pa0 = await ethers.provider.getBalance(patron.address);
			const ag0 = await ethers.provider.getBalance(agent.address);
			await s.split();
			expect((await ethers.provider.getBalance(platform.address)) - p0).to.equal(ethers.parseEther("2"));
			expect((await ethers.provider.getBalance(patron.address)) - pa0).to.equal(0n);
			expect((await ethers.provider.getBalance(agent.address)) - ag0).to.equal(ethers.parseEther("2"));
		});

		it("skips zero-amount legs cleanly (no native send)", async () => {
			// platform = 1000, patron = 0, agent = 9000. Small amount: 5 wei
			// platform = 5*1000/10000 = 0 → skipped, patron = 0 → skipped, agent = 5
			const s = await deploySplitter(1000, 0, platform, patron, agent);
			await owner.sendTransaction({ to: await s.getAddress(), value: 5n });
			await expect(s.split()).to.emit(s, "Split").withArgs(ethers.ZeroAddress, 0n, 0n, 5n);
		});
	});

	describe("splitToken() - ERC20", () => {
		let token;

		beforeEach(async () => {
			const Token = await ethers.getContractFactory("ERC20Mock");
			token = await Token.deploy();
		});

		it("splits a normal ERC20 10/25/65 and sums to total", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			const amt = ethers.parseEther("1000");
			await token.mint(await s.getAddress(), amt);

			await expect(s.splitToken(await token.getAddress()))
				.to.emit(s, "Split")
				.withArgs(
					await token.getAddress(),
					ethers.parseEther("100"),
					ethers.parseEther("250"),
					ethers.parseEther("650"),
				);

			expect(await token.balanceOf(platform.address)).to.equal(ethers.parseEther("100"));
			expect(await token.balanceOf(patron.address)).to.equal(ethers.parseEther("250"));
			expect(await token.balanceOf(agent.address)).to.equal(ethers.parseEther("650"));
			expect(await token.balanceOf(await s.getAddress())).to.equal(0);
		});

		it("is a no-op on zero token balance (no event)", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			const tx = await s.splitToken(await token.getAddress());
			const rcpt = await tx.wait();
			const evt = rcpt.logs.find((l) => {
				try {
					return s.interface.parseLog(l)?.name === "Split";
				} catch {
					return false;
				}
			});
			expect(evt).to.equal(undefined);
		});

		it("handles fee-on-transfer tokens (residual left, idempotent re-call sees less)", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			const Fee = await ethers.getContractFactory("FeeOnTransferToken");
			const fee = await Fee.deploy();
			const amt = ethers.parseEther("1000");
			await fee.mint(await s.getAddress(), amt);

			// First split: 10% burn on each leg. The splitter's balance reports 1000.
			// platform gets 100*0.9 = 90, patron 250*0.9 = 225, agent 650*0.9 = 585.
			// 100 burned total in the process.
			await s.splitToken(await fee.getAddress());
			expect(await fee.balanceOf(platform.address)).to.equal(ethers.parseEther("90"));
			expect(await fee.balanceOf(patron.address)).to.equal(ethers.parseEther("225"));
			expect(await fee.balanceOf(agent.address)).to.equal(ethers.parseEther("585"));
			expect(await fee.balanceOf(await s.getAddress())).to.equal(0n);

			// Second call should be a no-op (zero remaining)
			const tx2 = await s.splitToken(await fee.getAddress());
			const rcpt2 = await tx2.wait();
			const evt = rcpt2.logs.find((l) => {
				try {
					return s.interface.parseLog(l)?.name === "Split";
				} catch {
					return false;
				}
			});
			expect(evt).to.equal(undefined);
		});

		it("splitMany handles multiple tokens in one tx", async () => {
			const s = await deploySplitter(1000, 2500, platform, patron, agent);
			const Token = await ethers.getContractFactory("ERC20Mock");
			const t1 = await Token.deploy();
			const t2 = await Token.deploy();
			const t3 = await Token.deploy(); // zero balance - no-op leg

			await t1.mint(await s.getAddress(), ethers.parseEther("100"));
			await t2.mint(await s.getAddress(), ethers.parseEther("200"));

			await s.splitMany([await t1.getAddress(), await t2.getAddress(), await t3.getAddress()]);

			expect(await t1.balanceOf(agent.address)).to.equal(ethers.parseEther("65"));
			expect(await t2.balanceOf(agent.address)).to.equal(ethers.parseEther("130"));
			expect(await t3.balanceOf(agent.address)).to.equal(0n);
		});
	});

	describe("reentrancy", () => {
		it("malicious recipient cannot drain the splitter via recursive split()", async () => {
			// Deploy a reentrant receiver as the patron; on receive() it calls split() again.
			const Re = await ethers.getContractFactory("ReentrantReceiver");
			const attacker = await Re.deploy();

			const s = await deploySplitter(1000, 2500, platform, attacker, agent);
			await attacker.setTarget(await s.getAddress());

			const amt = ethers.parseEther("1");
			await owner.sendTransaction({ to: await s.getAddress(), value: amt });

			// The first split sends 10% to platform (EOA, fine), then 25% to attacker.
			// On receive(), attacker calls split() again. But by then balance has already
			// been partially distributed: platform got its 10%, the call-stack is mid-transfer
			// to attacker so the attacker's 25% is in-flight. The remaining balance in the
			// splitter is 65% (agent's leg has not gone out yet).
			// Inner split() re-runs the math on that 65% balance:
			//   platform += 6.5%, patron(attacker) += 16.25%, agent += 42.25%.
			// This is benign re-entrancy: it just sends funds to the SAME recipients per BPS,
			// and the outer call's agent-leg transfers the (now-zero) remainder.
			// CRITICAL: total funds out == funds in. No drain possible.

			const p0 = await ethers.provider.getBalance(platform.address);
			const ag0 = await ethers.provider.getBalance(agent.address);

			await s.split();

			// All funds should be out of the splitter, distributed among the 3 recipients.
			expect(await ethers.provider.getBalance(await s.getAddress())).to.equal(0n);

			const pGain = (await ethers.provider.getBalance(platform.address)) - p0;
			const agGain = (await ethers.provider.getBalance(agent.address)) - ag0;
			const attackerBal = await ethers.provider.getBalance(await attacker.getAddress());

			// Sum must equal the input. No more, no less.
			expect(pGain + agGain + attackerBal).to.equal(amt);
		});
	});
});
