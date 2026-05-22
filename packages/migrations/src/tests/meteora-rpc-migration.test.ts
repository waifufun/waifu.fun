import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
	CollectFeeMode,
	CpAmm,
	type InitializeCustomizeablePoolParams,
	MAX_SQRT_PRICE,
	MIN_SQRT_PRICE,
	getReservesAmountForConcentratedLiquidity,
	getSqrtPriceFromPrice,
} from "@meteora-ag/cp-amm-sdk";
import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import type DB from "@waifufun/database";
import { type MeteoraVaultTypes, getVaultIdl } from "@waifufun/programs";
import type redis from "@waifufun/redis";
import type { IMigration, SolanaAddressLike } from "@waifufun/types";
import BN from "bn.js";
import Decimal from "decimal.js";
import { afterEach, before, describe, it } from "mocha";
import { buildMeteoraCustomPoolFees } from "../protocols/meteora/calls.js";
import { MigrationService } from "../services/migration-service.js";
import { claimPositionFee, depositToMeteora, emergencyWithdraw } from "../vaults/meteoraVault.js";
import { derivePositionNftAccount } from "../vaults/meteroaPdas.js";
import { expect, sinon } from "./setup.js";

function meteoraRpcMigrationIntegrationEnabled(): boolean {
	const key = process.env.EXECUTOR_PRIVATE_KEY;
	return typeof key === "string" && key.length > 0;
}

// Env: HELIUS_API_KEY, EXECUTOR_PRIVATE_KEY (packages/migrations)

const TEST_TIMEOUT = 2 * 60 * 1000;
const TOTAL_SUPPLY = 1_000_000_000; // 1B tokens
const TOKEN_DECIMALS = 6;
const SOL_AMOUNT = 8.5 * LAMPORTS_PER_SOL; // 8.5 SOL total (10% of 85 SOL)
const TOKEN_AMOUNT = 24_778 * 10 ** TOKEN_DECIMALS; // 10% of 247780
const FIXED_FEE = 0.6 * LAMPORTS_PER_SOL; // 0.6 SOL (10% of 6 SOL)

(meteoraRpcMigrationIntegrationEnabled() ? describe : describe.skip)("Meteora RPC Migration Integration", function () {
	this.timeout(TEST_TIMEOUT);

	let connection: Connection;
	let wallet: Wallet;
	let provider: AnchorProvider;
	let program: Program<MeteoraVaultTypes>;
	let migrationService: MigrationService;

	let mockDb: any;
	let mockRedis: any;

	let mint: PublicKey;
	let tokenAccount: PublicKey;
	let primaryPositionNftKeypair: Keypair;
	let secondaryPositionNftKeypair: Keypair;
	let pool: PublicKey;
	let position: PublicKey;

	// mock migration record
	let mockMigration: IMigration;

	before(async () => {
		const rpcUrl = process.env.HELIUS_API_KEY
			? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
			: "https://api.devnet.solana.com";
		connection = new Connection(rpcUrl, "confirmed");

		const rawKey = process.env.EXECUTOR_PRIVATE_KEY;
		if (!rawKey) {
			throw new Error("EXECUTOR_PRIVATE_KEY not set");
		}
		const privateKeyBytes = Uint8Array.from(JSON.parse(rawKey));
		const keypair = Keypair.fromSecretKey(privateKeyBytes);
		wallet = new Wallet(keypair);

		const currentBalance = await connection.getBalance(wallet.publicKey);
		const desiredBalance = 10 * LAMPORTS_PER_SOL; // keep at least 10 SOL
		if (currentBalance < desiredBalance) {
			console.log("Requesting Devnet airdrop...");
			const sig = await connection.requestAirdrop(wallet.publicKey, desiredBalance);
			await connection.confirmTransaction(sig, "confirmed");
		}

		// Build Anchor provider & program
		provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
		program = new Program<MeteoraVaultTypes>(getVaultIdl("meteora"), provider);

		// mocks for DB and Redis
		mockDb = {
			Migration: {
				find: sinon.stub().returns({ limit: sinon.stub().resolves([]) }),
				findOneAndUpdate: sinon.stub().resolves(null),
				findOne: sinon.stub().resolves(null),
				updateOne: sinon.stub().resolves(null),
			},
		};
		mockRedis = {
			set: sinon.stub().resolves("OK"),
			get: sinon.stub().resolves(null),
			del: sinon.stub().resolves(1),
		};

		// 6) Initialize our MigrationService (it will start its interval, but because we gave it a fake DB+Redis,
		//    it won’t actually process anything unless we stub find() to return a migration).
		migrationService = new MigrationService(
			connection,
			provider,
			mockRedis as unknown as typeof redis,
			mockDb as unknown as typeof DB,
		);

		(migrationService as any).keyPair = keypair;
		await migrationService.initialize();
	});

	afterEach(() => {
		migrationService.shutdown();
		sinon.restore();
	});

	it("Step 1 – Mint a test SPL token and create associated account", async () => {
		// a) Create a new mint with TOKEN_DECIMALS, authority = our wallet
		mint = await createMint(
			connection,
			wallet.payer, // payer
			wallet.publicKey, // mint authority
			wallet.publicKey, // freeze authority
			TOKEN_DECIMALS,
		);

		// b) Create (or get) the associated token account for our wallet
		const ata = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, mint, wallet.publicKey);
		tokenAccount = ata.address;

		// c) Mint the entire TOTAL_SUPPLY into that account
		const fullSupply = new BN(TOTAL_SUPPLY).mul(new BN(10).pow(new BN(TOKEN_DECIMALS)));
		await mintTo(connection, wallet.payer, mint, tokenAccount, wallet.publicKey, fullSupply.toNumber());

		expect(mint).to.be.instanceOf(PublicKey);
		expect(tokenAccount).to.be.instanceOf(PublicKey);

		console.log("Step 1 complete: Minted", TOTAL_SUPPLY, "tokens to", tokenAccount.toBase58());
	});

	it("Step 2 – Create primary and secondary Position NFTs", async () => {
		primaryPositionNftKeypair = Keypair.generate();
		secondaryPositionNftKeypair = Keypair.generate();

		expect(primaryPositionNftKeypair.publicKey).to.be.instanceOf(PublicKey);
		expect(secondaryPositionNftKeypair.publicKey).to.be.instanceOf(PublicKey);

		console.log("Step 2 complete: Primary NFT =", primaryPositionNftKeypair.publicKey.toBase58());
		console.log("Step 2 complete: Secondary NFT =", secondaryPositionNftKeypair.publicKey.toBase58());
	});

	it("Step 3 – Create pool with primary NFT", async () => {
		const cpAmm = new CpAmm(connection);
		const tokenAMint = mint;
		const tokenBMint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
		const tokenADecimals = TOKEN_DECIMALS;
		const tokenBDecimals = 9;

		// Put 90% of minted tokens + SOL into the “initial liquidity” to get a reasonable price
		const primaryTokens = new BN(TOKEN_AMOUNT).muln(90).divn(100);
		const primarySol = new BN(SOL_AMOUNT).sub(new BN(FIXED_FEE)).muln(90).divn(100);
		const tokenADecimal = TOKEN_DECIMALS;
		const tokenBDecimal = 9;
		// Compute a human‐readable price: price = (SOL_amount) / (token_amount)
		const humanA = new Decimal(primaryTokens.toString()).div(new Decimal(10).pow(tokenADecimal));
		const humanB = new Decimal(primarySol.toString()).div(new Decimal(10).pow(tokenBDecimal));
		const initPrice = humanB.div(humanA).toString();

		// Compute activation UNIX timestamp = now + 7 minutes
		const activationPoint = new BN(Math.floor(Date.now() / 1000) + 0.1 * 60);

		// Derive the liquidityDelta at current price bounds
		const liquidityDelta = cpAmm.getLiquidityDelta({
			maxAmountTokenA: primaryTokens,
			maxAmountTokenB: primarySol,
			sqrtPrice: getSqrtPriceFromPrice(initPrice, tokenADecimals, tokenBDecimals),
			sqrtMinPrice: MIN_SQRT_PRICE,
			sqrtMaxPrice: MAX_SQRT_PRICE,
			collectFeeMode: CollectFeeMode.BothToken,
		});

		const createCustomPoolParams: InitializeCustomizeablePoolParams = {
			payer: wallet.publicKey,
			creator: wallet.publicKey,
			positionNft: primaryPositionNftKeypair.publicKey,
			tokenAMint,
			tokenBMint,
			tokenAAmount: primaryTokens,
			tokenBAmount: primarySol,
			sqrtMinPrice: MIN_SQRT_PRICE,
			sqrtMaxPrice: MAX_SQRT_PRICE,
			// amount of liquidity to be added
			liquidityDelta: liquidityDelta,
			initSqrtPrice: getSqrtPriceFromPrice(initPrice, tokenADecimal, tokenBDecimal),
			poolFees: buildMeteoraCustomPoolFees(tokenBDecimal),
			hasAlphaVault: false,
			activationType: 1,
			collectFeeMode: 0,
			activationPoint: activationPoint,
			tokenAProgram: TOKEN_PROGRAM_ID,
			tokenBProgram: TOKEN_PROGRAM_ID,
		};

		// Create the pool on Devnet
		const { tx, pool: newPool, position: newPosition } = await cpAmm.createCustomPool(createCustomPoolParams);

		const { blockhash } = await connection.getLatestBlockhash();
		tx.recentBlockhash = blockhash;
		const txId = await connection.sendTransaction(tx, [wallet.payer, primaryPositionNftKeypair]);
		await connection.confirmTransaction(txId, "confirmed");

		pool = newPool;
		console.log("Pool created with ID:", pool.toString());
		position = newPosition;

		expect(pool).to.be.instanceOf(PublicKey);
		expect(position).to.be.instanceOf(PublicKey);

		console.log("Step 3 complete: Pool =", pool.toBase58(), "Position =", position.toBase58());
	});

	it("Step 4 – Create position with secondary NFT", async () => {
		const cpAmm = new CpAmm(connection);
		const createPositionTx = await cpAmm.createPosition({
			owner: wallet.publicKey,
			payer: wallet.publicKey,
			pool,
			positionNft: secondaryPositionNftKeypair.publicKey,
		});

		const { blockhash } = await connection.getLatestBlockhash();
		createPositionTx.recentBlockhash = blockhash;
		const positionTxId = await connection.sendTransaction(createPositionTx, [
			wallet.payer,
			secondaryPositionNftKeypair,
		]);
		await connection.confirmTransaction(positionTxId, "confirmed");

		expect(positionTxId).to.be.a("string");
		console.log("Step 4 complete: Created position. TX =", positionTxId);
	});

	it("Step 5 – Add liquidity to the pool", async () => {
		const cpAmm = new CpAmm(connection);
		const poolState = await cpAmm.fetchPoolState(pool);

		// Derive the associated token account for the NFT so we can find the position record
		const positionNftAccount = derivePositionNftAccount(secondaryPositionNftKeypair.publicKey);

		// Fetch user’s positions and find ours

		const userPositions = await cpAmm.getUserPositionByPool(pool, wallet.publicKey);
		const userPosition = userPositions.find((p) => p.positionNftAccount.equals(positionNftAccount));
		if (!userPosition) {
			throw new Error("Could not find the secondary position NFT in pool");
		}

		// Use 10% of supply for this second “add liquidity” step
		const secondaryTokens = new BN(TOKEN_AMOUNT).muln(10).divn(100);

		// Get a quote
		const [poolTokenAAmount, poolTokenBAmount] = getReservesAmountForConcentratedLiquidity(
			poolState.sqrtPrice,
			poolState.sqrtMinPrice,
			poolState.sqrtMaxPrice,
			poolState.liquidity,
		);

		const quote = cpAmm.getDepositQuote({
			inAmount: secondaryTokens,
			isTokenA: true,
			minSqrtPrice: MIN_SQRT_PRICE,
			maxSqrtPrice: MAX_SQRT_PRICE,
			sqrtPrice: poolState.sqrtPrice,
			collectFeeMode: poolState.collectFeeMode as CollectFeeMode,
			tokenAAmount: poolTokenAAmount,
			tokenBAmount: poolTokenBAmount,
			liquidity: poolState.liquidity,
		});
		const maxAmountTokenA = quote.actualInputAmount;
		const maxAmountTokenB = quote.outputAmount;
		const tokenAAmountThreshold = quote.actualInputAmount;
		const tokenBAmountThreshold = quote.outputAmount;

		const addLiquidityParams = {
			owner: wallet.publicKey,
			pool,
			position: userPosition.position,
			positionNftAccount: positionNftAccount,
			liquidityDelta: quote.liquidityDelta,
			maxAmountTokenA,
			maxAmountTokenB,
			tokenAAmountThreshold,
			tokenBAmountThreshold,
			tokenAMint: poolState.tokenAMint,
			tokenBMint: poolState.tokenBMint,
			tokenAVault: poolState.tokenAVault,
			tokenBVault: poolState.tokenBVault,
			tokenAProgram: TOKEN_PROGRAM_ID,
			tokenBProgram: TOKEN_PROGRAM_ID,
		};

		// Build addLiquidity instruction
		const addLiquidityTx = await cpAmm.addLiquidity(addLiquidityParams);

		const { blockhash } = await connection.getLatestBlockhash();
		addLiquidityTx.recentBlockhash = blockhash;
		const liquidityTxId = await connection.sendTransaction(addLiquidityTx, [wallet.payer]);
		await connection.confirmTransaction(liquidityTxId, "confirmed");

		expect(liquidityTxId).to.be.a("string");
		console.log("Step 5 complete: Added liquidity. TX =", liquidityTxId);
	});

	it("Step 6 – Deposit primary NFT to Meteora vault", async () => {
		const fromAccount = derivePositionNftAccount(primaryPositionNftKeypair.publicKey);
		const balance = await provider.connection.getTokenAccountBalance(fromAccount);
		if (!balance.value.uiAmount || balance.value.uiAmount < 1) {
			throw new Error("Insufficient NFT balance in token account");
		}

		const depositTxId = await depositToMeteora(
			provider,
			wallet.payer,
			program,
			primaryPositionNftKeypair.publicKey,
			wallet.publicKey,
			fromAccount,
		);

		expect(depositTxId).to.be.a("string");
		console.log("Step 6 complete: Deposited primary NFT. TX =", depositTxId);
	});

	//claimPositionFee
	it("Step 7 – Claim position fee from Meteora vault", async () => {
		const claimTxId = await claimPositionFee(
			provider,
			wallet.payer,
			program,
			primaryPositionNftKeypair.publicKey,
			pool,
			mint,
			new PublicKey("So11111111111111111111111111111111111111112"),
			TOKEN_PROGRAM_ID,
			TOKEN_PROGRAM_ID,
		);
		expect(claimTxId).to.be.a("string");
		console.log("Step 7 complete: Claimed position fee. TX =", claimTxId);
	});

	it("Step 8 – withdraw primary NFT to Meteora vault", async () => {
		// const key = [];
		// const primaryPositionNftKeypair = Keypair.fromSecretKey(Uint8Array.from(key));
		const withdrawTxId = await emergencyWithdraw(provider, wallet.payer, program, primaryPositionNftKeypair.publicKey);

		expect(withdrawTxId).to.be.a("string");
		console.log("Step 8 complete: withdraw primary NFT . TX =", withdrawTxId);
	});

	it("Bonus Step – Call processMigration on our mock migration record", async () => {
		mockMigration = {
			_id: "test-meteora-migration-id",
			protocol: "meteora",
			status: "migrating",
			currentStep: 0,
			contractAddress: wallet.publicKey.toBase58() as SolanaAddressLike,
			protocolState: JSON.stringify({
				tokenMint: mint.toBase58(),
				amount: TOKEN_AMOUNT,
				poolAddress: pool.toBase58(),
				transactions: [],
			}),
			chain: "solana",
			chainId: "devnet" as any,
			creator: wallet.publicKey.toBase58() as SolanaAddressLike,
			version: 1,
		};

		mockDb.Migration.find.returns({
			limit: sinon.stub().resolves([mockMigration]),
		});
		const fakeMgr = {
			initializePrograms: sinon.stub().resolves(),
			getMigrationSteps: sinon.stub().resolves([]),
			executeMigration: sinon.stub().resolves({ success: true }),
		};
		(
			migrationService as unknown as {
				migrationManager: typeof fakeMgr;
			}
		).migrationManager = fakeMgr;

		await migrationService.processMigrations();

		console.log("Bonus: processMigrations() invoked.");
	});
});
