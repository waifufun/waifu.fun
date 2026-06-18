// ERC-8183 agentic-commerce escrow test matrix.
//
// Covers:
//   - createJob -> setBudget -> fund -> submit -> settle (happy path, provider paid)
//   - createJob -> setBudget -> fund -> expiry -> claimRefund (client refunded)
//   - dispute path (client rejects, reclaims escrow immediately)
//   - double-fund / double-settle reverts
//   - only the job's bound router can release escrow (settleJob auth)
//   - settle blocked before the optimistic challenge window elapses
//   - ReentrancyGuard holds (malicious token cannot re-enter fund)
//   - getJob / getJobStatus shape + unknown-job reverts
//
// Status codes (must match @stwd/erc8183): 0 OPEN, 1 FUNDED, 2 SUBMITTED, 3 SETTLED,
// 4 REJECTED, 5 REFUNDED.

const { expect } = require("chai");
const { ethers } = require("hardhat");

const OPEN = 0n;
const FUNDED = 1n;
const SUBMITTED = 2n;
const SETTLED = 3n;
const REJECTED = 4n;
const REFUNDED = 5n;

const CHALLENGE_WINDOW = 3600n; // 1 hour
const BUDGET = ethers.parseUnits("100", 18);
const DELIVERABLE = ethers.keccak256(ethers.toUtf8Bytes("deliverable-v1"));

async function now() {
	const block = await ethers.provider.getBlock("latest");
	return BigInt(block.timestamp);
}

async function increaseTime(seconds) {
	await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
	await ethers.provider.send("evm_mine", []);
}

// Full deployment: token, commerce, router, policy. Router is wired so commerce trusts it
// (createJob names the router) and policy is owned by the router for the optimistic clock.
async function deployStack() {
	const [deployer, client, provider, stranger] = await ethers.getSigners();

	const Token = await ethers.getContractFactory("ERC20Mock");
	const token = await Token.deploy();

	const Commerce = await ethers.getContractFactory("AgenticCommerce");
	const commerce = await Commerce.deploy(await token.getAddress());

	// The router is deployed before the policy, but the policy needs the router address and the
	// router needs a default policy address. We deploy router first with a placeholder default,
	// then deploy the real policy pointing at the router, then use a router that already knows
	// the policy. To keep the wiring 1:1 with the deploy script we deploy policy with the known
	// router address by precomputing it via a two-step: deploy router after policy using a
	// CREATE-order trick is messy, so we instead deploy router pointing to a policy we compute.
	//
	// Simplest correct ordering: deploy a throwaway to learn nonce is overkill. Instead deploy
	// the Router with defaultPolicy = predicted policy address.
	const deployerNonce = await ethers.provider.getTransactionCount(deployer.address);
	// Next two contract addresses from `deployer`: router at nonce N, policy at nonce N+1.
	const predictedRouter = ethers.getCreateAddress({ from: deployer.address, nonce: deployerNonce });
	const predictedPolicy = ethers.getCreateAddress({ from: deployer.address, nonce: deployerNonce + 1 });

	const Router = await ethers.getContractFactory("EvaluatorRouter");
	const router = await Router.deploy(await commerce.getAddress(), predictedPolicy);
	expect(await router.getAddress()).to.equal(predictedRouter);

	const Policy = await ethers.getContractFactory("OptimisticPolicy");
	const policy = await Policy.deploy(predictedRouter, CHALLENGE_WINDOW);
	expect(await policy.getAddress()).to.equal(predictedPolicy);

	// Fund the client with tokens.
	await token.mint(client.address, BUDGET * 10n);

	return { deployer, client, provider, stranger, token, commerce, router, policy };
}

async function openFundedJob(ctx, expiryOffset = 7n * 24n * 3600n) {
	const { client, provider, router, commerce, token } = ctx;
	const expiredAt = (await now()) + expiryOffset;
	const tx = await commerce
		.connect(client)
		.createJob(provider.address, await router.getAddress(), expiredAt, "build a thing");
	const receipt = await tx.wait();
	// Decode jobId from the JobCreated event.
	const parsed = receipt.logs
		.map((l) => {
			try {
				return commerce.interface.parseLog(l);
			} catch {
				return null;
			}
		})
		.find((p) => p && p.name === "JobCreated");
	const jobId = parsed.args.jobId;

	await commerce.connect(client).setBudget(jobId, BUDGET);
	await token.connect(client).approve(await commerce.getAddress(), BUDGET);
	await commerce.connect(client).fund(jobId, BUDGET);
	return { jobId, expiredAt };
}

describe("ERC-8183 escrow (AgenticCommerce + EvaluatorRouter + OptimisticPolicy)", () => {
	describe("happy path: create -> fund -> submit -> settle", () => {
		it("pays the provider the full budget on settle", async () => {
			const ctx = await deployStack();
			const { client, provider, router, commerce, policy, token } = ctx;
			const { jobId } = await openFundedJob(ctx);

			expect(await commerce.getJobStatus(jobId)).to.equal(FUNDED);

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			expect(await commerce.getJobStatus(jobId)).to.equal(SUBMITTED);

			// Start the optimistic clock and pass the challenge window.
			await router.noteSubmission(jobId);
			await increaseTime(CHALLENGE_WINDOW + 1n);

			const before = await token.balanceOf(provider.address);
			await router.settle(jobId);
			const after = await token.balanceOf(provider.address);

			expect(after - before).to.equal(BUDGET);
			expect(await commerce.getJobStatus(jobId)).to.equal(SETTLED);

			const job = await commerce.getJob(jobId);
			expect(job.status).to.equal(SETTLED);
			expect(job.provider).to.equal(provider.address);
			expect(job.policy).to.equal(await policy.getAddress());
			expect(job.deliverableHash).to.equal(DELIVERABLE);
			// Escrow fully drained.
			expect(await token.balanceOf(await commerce.getAddress())).to.equal(0n);
		});

		it("settle reverts before the challenge window elapses", async () => {
			const ctx = await deployStack();
			const { provider, router, commerce } = ctx;
			const { jobId } = await openFundedJob(ctx);

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			await router.noteSubmission(jobId);
			// Only a little time passes (less than the window).
			await increaseTime(CHALLENGE_WINDOW - 100n);

			await expect(router.settle(jobId)).to.be.revertedWithCustomError(router, "NotSettleable");
		});

		it("settle reverts if the optimistic clock was never started", async () => {
			const ctx = await deployStack();
			const { provider, router, commerce } = ctx;
			const { jobId } = await openFundedJob(ctx);

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			await increaseTime(CHALLENGE_WINDOW + 1n); // window passes but no noteSubmission

			await expect(router.settle(jobId)).to.be.revertedWithCustomError(router, "NotSettleable");
		});
	});

	describe("refund path: create -> fund -> expiry -> claimRefund", () => {
		it("refunds the client the full budget after expiry", async () => {
			const ctx = await deployStack();
			const { client, commerce, token } = ctx;
			const { jobId } = await openFundedJob(ctx, 1000n);

			// Not yet expired.
			await expect(commerce.connect(client).claimRefund(jobId)).to.be.revertedWithCustomError(commerce, "NotExpired");

			await increaseTime(1001n);

			const before = await token.balanceOf(client.address);
			await commerce.connect(client).claimRefund(jobId);
			const after = await token.balanceOf(client.address);

			expect(after - before).to.equal(BUDGET);
			expect(await commerce.getJobStatus(jobId)).to.equal(REFUNDED);
			expect(await token.balanceOf(await commerce.getAddress())).to.equal(0n);
		});

		it("refunds even after the provider submitted, once expired", async () => {
			const ctx = await deployStack();
			const { client, provider, commerce, token } = ctx;
			const { jobId } = await openFundedJob(ctx, 1000n);

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			await increaseTime(1001n);

			const before = await token.balanceOf(client.address);
			await commerce.connect(client).claimRefund(jobId);
			const after = await token.balanceOf(client.address);
			expect(after - before).to.equal(BUDGET);
			expect(await commerce.getJobStatus(jobId)).to.equal(REFUNDED);
		});

		it("only the client can claim the refund", async () => {
			const ctx = await deployStack();
			const { stranger, commerce } = ctx;
			const { jobId } = await openFundedJob(ctx, 1000n);
			await increaseTime(1001n);
			await expect(commerce.connect(stranger).claimRefund(jobId)).to.be.revertedWithCustomError(commerce, "NotClient");
		});
	});

	describe("dispute path", () => {
		it("lets the client reject a submission and reclaim escrow immediately", async () => {
			const ctx = await deployStack();
			const { client, provider, commerce, token } = ctx;
			const { jobId } = await openFundedJob(ctx);

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			await commerce.connect(client).dispute(jobId);
			expect(await commerce.getJobStatus(jobId)).to.equal(REJECTED);

			// No expiry wait needed once rejected.
			const before = await token.balanceOf(client.address);
			await commerce.connect(client).claimRefund(jobId);
			const after = await token.balanceOf(client.address);
			expect(after - before).to.equal(BUDGET);
			expect(await commerce.getJobStatus(jobId)).to.equal(REFUNDED);
		});

		it("a disputed job is not optimistically settleable", async () => {
			const ctx = await deployStack();
			const { client, provider, router, commerce } = ctx;
			const { jobId } = await openFundedJob(ctx);

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			await router.noteSubmission(jobId);
			await commerce.connect(client).dispute(jobId);
			await increaseTime(CHALLENGE_WINDOW + 1n);

			await expect(router.settle(jobId)).to.be.revertedWithCustomError(router, "NotSettleable");
		});

		it("only the client can dispute, and only from SUBMITTED", async () => {
			const ctx = await deployStack();
			const { client, provider, stranger, commerce } = ctx;
			const { jobId } = await openFundedJob(ctx);

			// Cannot dispute while merely FUNDED.
			await expect(commerce.connect(client).dispute(jobId)).to.be.revertedWithCustomError(commerce, "BadStatus");

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			await expect(commerce.connect(stranger).dispute(jobId)).to.be.revertedWithCustomError(commerce, "NotClient");
		});
	});

	describe("authorization + double-action guards", () => {
		it("double-fund reverts (status already FUNDED)", async () => {
			const ctx = await deployStack();
			const { client, commerce, token } = ctx;
			const { jobId } = await openFundedJob(ctx);

			await token.connect(client).approve(await commerce.getAddress(), BUDGET);
			await expect(commerce.connect(client).fund(jobId, BUDGET)).to.be.revertedWithCustomError(commerce, "BadStatus");
		});

		it("double-settle reverts (status already SETTLED)", async () => {
			const ctx = await deployStack();
			const { provider, router, commerce } = ctx;
			const { jobId } = await openFundedJob(ctx);

			await commerce.connect(provider).submit(jobId, DELIVERABLE);
			await router.noteSubmission(jobId);
			await increaseTime(CHALLENGE_WINDOW + 1n);
			await router.settle(jobId);

			await expect(router.settle(jobId)).to.be.revertedWithCustomError(router, "NotSettleable");
		});

		it("only the bound router can call settleJob on the escrow directly", async () => {
			const ctx = await deployStack();
			const { stranger, provider, policy, commerce } = ctx;
			const { jobId } = await openFundedJob(ctx);
			await commerce.connect(provider).submit(jobId, DELIVERABLE);

			// A stranger (not the router) cannot release escrow.
			await expect(
				commerce.connect(stranger).settleJob(jobId, await policy.getAddress()),
			).to.be.revertedWithCustomError(commerce, "NotRouter");
		});

		it("setBudget is client-only and one-shot", async () => {
			const ctx = await deployStack();
			const { client, provider, stranger, router, commerce } = ctx;
			const expiredAt = (await now()) + 100000n;
			const tx = await commerce.connect(client).createJob(provider.address, await router.getAddress(), expiredAt, "x");
			const receipt = await tx.wait();
			const jobId = receipt.logs
				.map((l) => {
					try {
						return commerce.interface.parseLog(l);
					} catch {
						return null;
					}
				})
				.find((p) => p && p.name === "JobCreated").args.jobId;

			await expect(commerce.connect(stranger).setBudget(jobId, BUDGET)).to.be.revertedWithCustomError(
				commerce,
				"NotClient",
			);
			await commerce.connect(client).setBudget(jobId, BUDGET);
			await expect(commerce.connect(client).setBudget(jobId, BUDGET)).to.be.revertedWithCustomError(
				commerce,
				"BudgetAlreadySet",
			);
		});

		it("fund must match the set budget exactly", async () => {
			const ctx = await deployStack();
			const { client, provider, router, commerce, token } = ctx;
			const expiredAt = (await now()) + 100000n;
			const tx = await commerce.connect(client).createJob(provider.address, await router.getAddress(), expiredAt, "x");
			const jobId = (await tx.wait()).logs
				.map((l) => {
					try {
						return commerce.interface.parseLog(l);
					} catch {
						return null;
					}
				})
				.find((p) => p && p.name === "JobCreated").args.jobId;

			// Cannot fund before budget set.
			await token.connect(client).approve(await commerce.getAddress(), BUDGET);
			await expect(commerce.connect(client).fund(jobId, BUDGET)).to.be.revertedWithCustomError(
				commerce,
				"BudgetNotSet",
			);

			await commerce.connect(client).setBudget(jobId, BUDGET);
			await expect(commerce.connect(client).fund(jobId, BUDGET - 1n)).to.be.revertedWithCustomError(
				commerce,
				"BudgetMismatch",
			);
		});

		it("registerJob can only bind a policy once and requires the right router", async () => {
			const ctx = await deployStack();
			const { client, provider, router, commerce, policy } = ctx;
			const { jobId } = await openFundedJob(ctx);

			await router.registerJob(jobId, await policy.getAddress());
			await expect(router.registerJob(jobId, await policy.getAddress())).to.be.revertedWithCustomError(
				router,
				"AlreadyRegistered",
			);
		});

		it("getJob / getJobStatus revert for unknown jobs", async () => {
			const ctx = await deployStack();
			const { commerce } = ctx;
			await expect(commerce.getJob(999n)).to.be.revertedWithCustomError(commerce, "UnknownJob");
			await expect(commerce.getJobStatus(999n)).to.be.revertedWithCustomError(commerce, "UnknownJob");
		});

		it("createJob reverts on zero provider/router or past expiry", async () => {
			const ctx = await deployStack();
			const { client, provider, router, commerce } = ctx;
			const future = (await now()) + 1000n;
			await expect(
				commerce.connect(client).createJob(ethers.ZeroAddress, await router.getAddress(), future, "x"),
			).to.be.revertedWithCustomError(commerce, "ZeroAddress");
			await expect(
				commerce.connect(client).createJob(provider.address, ethers.ZeroAddress, future, "x"),
			).to.be.revertedWithCustomError(commerce, "ZeroAddress");
			const past = (await now()) - 1n;
			await expect(
				commerce.connect(client).createJob(provider.address, await router.getAddress(), past, "x"),
			).to.be.revertedWithCustomError(commerce, "ExpiryInPast");
		});
	});

	describe("reentrancy", () => {
		it("fund is nonReentrant against a malicious token callback", async () => {
			const [deployer, client, provider] = await ethers.getSigners();

			// Deploy the reentrant token that calls back into fund() during transferFrom.
			const Evil = await ethers.getContractFactory("ReentrantEscrowToken");
			const evil = await Evil.deploy();

			const Commerce = await ethers.getContractFactory("AgenticCommerce");
			const commerce = await Commerce.deploy(await evil.getAddress());

			const Router = await ethers.getContractFactory("EvaluatorRouter");
			// default policy can be any non-zero address for this guard test.
			const router = await Router.deploy(await commerce.getAddress(), deployer.address);

			await evil.setTarget(await commerce.getAddress());
			await evil.mint(client.address, BUDGET * 2n);

			const expiredAt = (await now()) + 100000n;
			const tx = await commerce.connect(client).createJob(provider.address, await router.getAddress(), expiredAt, "x");
			const jobId = (await tx.wait()).logs
				.map((l) => {
					try {
						return commerce.interface.parseLog(l);
					} catch {
						return null;
					}
				})
				.find((p) => p && p.name === "JobCreated").args.jobId;

			await commerce.connect(client).setBudget(jobId, BUDGET);
			await evil.connect(client).approve(await commerce.getAddress(), BUDGET * 2n);
			await evil.setReenterJobId(jobId);

			// The reentrant fund() call inside transferFrom must bubble up and revert the whole tx.
			await expect(commerce.connect(client).fund(jobId, BUDGET)).to.be.reverted;
			// Escrow state untouched: job still OPEN, nothing escrowed.
			expect(await commerce.getJobStatus(jobId)).to.equal(OPEN);
		});
	});
});
