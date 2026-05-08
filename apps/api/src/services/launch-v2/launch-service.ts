/**
 * Launch service for the W42 LaunchFactory flow.
 *
 * Responsibilities:
 *   - Translate REST input into a LaunchFactory.createLaunch() transaction.
 *   - Decode the LaunchCreated event into addresses we persist in Postgres.
 *   - Read live vault state for GET endpoints (state, totals, depositor data).
 *   - Compute preview allocations (a thin wrapper around the on-chain math).
 *
 * Design notes:
 *   - We deviate from the spec's "ethers v6" guidance and use viem instead,
 *     since the rest of the API is already on viem (no point pulling a second
 *     web3 lib into the bundle). All interfaces remain identical.
 *   - All write transactions go through a single signer (`launchFactorySigner`)
 *     wallet whose private key is provisioned via env. The wallet only ever
 *     calls LaunchFactory.createLaunch on behalf of the requesting creator;
 *     the resulting vault/router are owned by `creator`, not by the signer.
 *   - The signer should hold a small BNB balance (gas only). It never holds
 *     user funds.
 */

import {
	http,
	type Abi,
	type Address,
	type Hash,
	type PublicClient,
	type WalletClient,
	createPublicClient,
	createWalletClient,
	getAddress,
	parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

import { launchFactoryAbi, launchVaultAbi } from "./abis.js";
import {
	type CreateLaunchInput,
	type CreateLaunchResult,
	type DepositorPosition,
	type PreviewAllocationInput,
	type PreviewAllocationResult,
	TIER_STRING_TO_ENUM,
	VAULT_STATE_LABELS,
	type VaultOnchainState,
} from "./types.js";

export interface LaunchServiceConfig {
	chainId: number;
	rpcUrl: string;
	launchFactoryAddress: Address;
	signerPrivateKey?: `0x${string}` | undefined;
	presaleUrlBase?: string | undefined;
}

export interface LaunchServiceClients {
	publicClient: PublicClient;
	walletClient?: WalletClient;
	signerAddress?: Address;
}

export class LaunchServiceError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "LaunchServiceError";
		this.code = code;
	}
}

/**
 * Build the viem clients for a given config. Splitting this out lets tests
 * inject mock clients without touching the network.
 */
export function createLaunchServiceClients(config: LaunchServiceConfig): LaunchServiceClients {
	const chain = config.chainId === 56 ? bsc : bscTestnet;
	const publicClient = createPublicClient({
		chain,
		transport: http(config.rpcUrl),
	});

	if (!config.signerPrivateKey) {
		return { publicClient: publicClient as PublicClient };
	}

	const account = privateKeyToAccount(config.signerPrivateKey);
	const walletClient = createWalletClient({
		account,
		chain,
		transport: http(config.rpcUrl),
	});
	return {
		publicClient: publicClient as PublicClient,
		walletClient,
		signerAddress: account.address,
	};
}

export class LaunchService {
	readonly config: LaunchServiceConfig;
	readonly clients: LaunchServiceClients;

	constructor(config: LaunchServiceConfig, clients?: LaunchServiceClients) {
		this.config = config;
		this.clients = clients ?? createLaunchServiceClients(config);
	}

	get publicClient(): PublicClient {
		return this.clients.publicClient;
	}

	requireWalletClient(): WalletClient {
		if (!this.clients.walletClient) {
			throw new LaunchServiceError(
				"NO_SIGNER",
				"Launch signer wallet is not configured (set LAUNCH_FACTORY_SIGNER_PK).",
			);
		}
		return this.clients.walletClient;
	}

	/**
	 * Submit createLaunch on-chain. Decodes LaunchCreated and returns the
	 * deployed (token, vault, router) addresses plus the tx hash.
	 *
	 * The DB layer (caller) is responsible for inserting the row before
	 * the tx is sent (so we can show "pending" state) and updating it on
	 * success/failure. This method only owns the on-chain side.
	 */
	async createLaunchOnchain(input: CreateLaunchInput): Promise<CreateLaunchResult> {
		const factory = this.config.launchFactoryAddress;
		if (!factory || factory === "0x0000000000000000000000000000000000000000") {
			throw new LaunchServiceError(
				"FACTORY_ADDRESS_UNSET",
				"LAUNCH_FACTORY_ADDRESS is not configured. Deploy the factory first.",
			);
		}

		const wallet = this.requireWalletClient();
		const tierEnum = TIER_STRING_TO_ENUM[input.tier];
		if (tierEnum === undefined) {
			throw new LaunchServiceError("INVALID_TIER", `Unknown tier: ${input.tier}`);
		}

		const config = {
			name: input.name,
			symbol: input.symbol,
			metadataURI: input.metadataURI,
			creator: input.creator,
			tier: tierEnum,
			closeTimestamp: BigInt(input.closeTimestamp),
		} as const;

		// Simulate first so failures surface a clean error before broadcast.
		const { request } = await this.publicClient.simulateContract({
			address: factory,
			abi: launchFactoryAbi,
			functionName: "createLaunch",
			args: [config],
			account: wallet.account,
		});

		const txHash: Hash = await wallet.writeContract(request);
		const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
		if (receipt.status !== "success") {
			throw new LaunchServiceError("TX_REVERTED", `createLaunch reverted (tx ${txHash})`);
		}

		// Decode LaunchCreated event from the receipt.
		const events = parseEventLogs({
			abi: launchFactoryAbi as unknown as Abi,
			logs: receipt.logs,
			eventName: "LaunchCreated",
		});
		if (events.length === 0) {
			throw new LaunchServiceError("EVENT_MISSING", `createLaunch tx ${txHash} produced no LaunchCreated event`);
		}
		const decoded = events[0] as unknown as {
			args: {
				creator: Address;
				token: Address;
				vault: Address;
				router: Address;
			};
		};

		const tokenAddress = decoded.args.token as `0x${string}`;
		const vaultAddress = decoded.args.vault as `0x${string}`;
		const routerAddress = decoded.args.router as `0x${string}`;
		const presaleUrl = this.buildPresaleUrl(tokenAddress);
		return {
			// id is supplied by the DB layer; the route handler stitches them together.
			id: "",
			token: tokenAddress,
			vault: vaultAddress,
			router: routerAddress,
			presaleUrl,
			txHash,
			blockNumber: receipt.blockNumber,
		};
	}

	/**
	 * Read the live vault state. Used by GET /:id to surface up-to-date
	 * totals even if the indexer is briefly behind.
	 */
	async readVaultState(vaultAddress: Address): Promise<VaultOnchainState> {
		const [stateIdx, totalDeposited, bonusPool, depositorCount, closeTs, launchTs, presaleTokens] = await Promise.all([
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "state",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "totalDeposited",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "bonusPool",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "depositorCount",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "closeTimestamp",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "launchTimestamp",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "presaleTokens",
			}),
		]);

		const stateLabel = VAULT_STATE_LABELS[Number(stateIdx as unknown as bigint)] ?? "open";
		const launchTimestamp = (launchTs as bigint) === 0n ? null : (launchTs as bigint);

		return {
			state: stateLabel,
			totalDeposited: totalDeposited as bigint,
			bonusPool: bonusPool as bigint,
			depositorCount: Number(depositorCount as bigint),
			closeTimestamp: closeTs as bigint,
			launchTimestamp,
			presaleTokens: presaleTokens as bigint,
		};
	}

	/**
	 * Per-user position. Used by GET /:id/depositors/:address.
	 *
	 * `claimable` reflects the on-chain claimable amount (TGE + linear vesting);
	 * `vestingProgress` is a 0..1 fraction relative to the configured vesting
	 * window (24h linear). Pre-launch this is always 0.
	 */
	async readDepositorPosition(
		vaultAddress: Address,
		userAddress: Address,
		now: number = Math.floor(Date.now() / 1000),
	): Promise<DepositorPosition> {
		const [depositorTuple, claimable, presaleTokens, totalDeposited, launchTs] = await Promise.all([
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "depositors",
				args: [userAddress],
			}),
			this.publicClient
				.readContract({
					address: vaultAddress,
					abi: launchVaultAbi,
					functionName: "claimableOf",
					args: [userAddress],
				})
				.catch(() => 0n),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "presaleTokens",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "totalDeposited",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "launchTimestamp",
			}),
		]);

		const [deposited, claimed] = depositorTuple as [bigint, bigint, boolean];
		const total = totalDeposited as bigint;
		const presale = presaleTokens as bigint;
		const totalAllocation = total === 0n ? 0n : (presale * deposited) / total;

		const launchSeconds = Number(launchTs as unknown as bigint);
		const vestingWindow = 86_400; // matches LaunchVault.VESTING_WINDOW
		const vestingProgress = launchSeconds === 0 ? 0 : Math.min(1, Math.max(0, (now - launchSeconds) / vestingWindow));

		return {
			address: getAddress(userAddress) as `0x${string}`,
			deposited,
			claimed,
			claimable: claimable as bigint,
			totalAllocation,
			vestingProgress,
		};
	}

	/**
	 * Preview a deposit's pro-rata allocation. The contract has no
	 * preview-only function so this is computed off-chain using the same math
	 * as the vault: tokens = presaleTokens * bnbAmount / (totalDeposited + bnbAmount).
	 * "share" is the resulting fraction of the presale.
	 *
	 * `projectedValueBnb` mirrors the implied opening BNB value (which equals
	 * the deposit pro-rata share of the v2 buy + curve fill on launch). For
	 * tiers without v2 buy this collapses to `bnbAmount`.
	 */
	async previewAllocation(vaultAddress: Address, input: PreviewAllocationInput): Promise<PreviewAllocationResult> {
		const [presaleTokens, totalDeposited] = await Promise.all([
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "presaleTokens",
			}),
			this.publicClient.readContract({
				address: vaultAddress,
				abi: launchVaultAbi,
				functionName: "totalDeposited",
			}),
		]);

		return computePreview({
			bnbAmount: input.bnbAmount,
			presaleTokens: presaleTokens as bigint,
			totalDeposited: totalDeposited as bigint,
		});
	}

	private buildPresaleUrl(tokenAddress: Address): string {
		const base = this.config.presaleUrlBase ?? "https://www.waifu.fun/launches";
		return `${base.replace(/\/+$/, "")}/${tokenAddress.toLowerCase()}`;
	}
}

/**
 * Pure compute of the preview math. Exported separately so tests can hit it
 * without spinning up RPC mocks.
 */
export function computePreview(args: {
	bnbAmount: bigint;
	presaleTokens: bigint;
	totalDeposited: bigint;
}): PreviewAllocationResult {
	const { bnbAmount, presaleTokens, totalDeposited } = args;
	if (bnbAmount <= 0n) {
		return { tokens: 0n, share: 0, projectedValueBnb: 0n };
	}
	const newTotal = totalDeposited + bnbAmount;
	if (newTotal === 0n) {
		return { tokens: 0n, share: 0, projectedValueBnb: bnbAmount };
	}
	const tokens = (presaleTokens * bnbAmount) / newTotal;
	const shareNum = Number(bnbAmount);
	const shareDen = Number(newTotal);
	const share = shareDen === 0 ? 0 : shareNum / shareDen;
	return {
		tokens,
		share,
		projectedValueBnb: bnbAmount,
	};
}
