/**
 * Agent launch orchestrator.
 *
 * Happy path:
 *   1. Ensure a Steward-managed agent wallet exists (provision if new).
 *   2. SIWE-log into Four.Meme using that wallet (Steward signs the message).
 *   3. Upload the token image to Four.Meme's CDN.
 *   4. POST /v1/private/token/create → get (createArg, signature).
 *   5. Broadcast TokenManager2.createToken(createArg, signature) via Steward
 *      (Steward signs + broadcasts; we poll for the receipt on BSC).
 *   6. Parse `TokenCreate` event → capture `token` address + requestId.
 *   7. Persist to `agent_wallets` + extended columns (token_address, treasury).
 *
 * The orchestrator is intentionally verbose about which step fails so that
 * HTTP routes can surface clear error messages and the test harness can
 * distinguish between Steward, Four.Meme, and on-chain failures.
 */

import {
	type Address,
	type Hex,
	type PublicClient,
	decodeEventLog,
	encodeAbiParameters,
	encodeFunctionData,
	getAddress,
	keccak256,
	parseEther,
	zeroAddress,
} from "viem";

import { TokenManager2Abi, createFourMemeClient } from "@waifufun/fourmeme";

import { AgentLaunchError } from "./errors.js";
import {
	DEFAULT_EIP8004_NFT_ADDRESS,
	type Eip8004Signer,
	type RegisterAgentIdentityResult,
	registerAgentIdentity,
} from "./fourmeme-8004-register.js";
import { fourMemeLogin } from "./fourmeme-auth.js";
import { type FourMemeCreateTokenInput, fourMemeCreateToken } from "./fourmeme-create.js";
import { fourMemeUploadImage } from "./fourmeme-upload.js";
import { type StewardClient, StewardError, isBroadcastResult, isPendingApproval } from "./steward.js";
import type {
	AgentLaunchInput,
	AgentLaunchResult,
	AgentPersonaConfig,
	FourMemeTaxConfig,
	IdentityRegistrationStatus,
} from "./types.js";

/**
 * Result returned by `prepare()` — everything needed to broadcast later,
 * without actually broadcasting. The caller is expected to stash the
 * `createArg` + `signature` (and optionally `preSale`) and call
 * `broadcastPrepared()` once some third-party condition is met (e.g. a human
 * patron has completed X-auth + funded the agent wallet).
 */
export interface AgentLaunchPrepareResult {
	agentId: string;
	walletAddress: Address;
	treasuryAddress: Address;
	taxSplit?: PreparedTaxSplit;
	createArg: Hex;
	signature: Hex;
	requestId?: string;
	fourMeme: {
		nonce: string;
		imageUrl: string;
		createArgHash: string;
	};
	identityRegistrationStatus: IdentityRegistrationStatus;
	agentIdentity?: {
		agentId: string;
		txHash: Hex;
		agentURI: string;
		contractAddress: Address;
	};
}

/**
 * Input for `broadcastPrepared()`. Mirrors the chain-broadcast step of
 * `launch()` but takes the four.meme artifacts as inputs so we can replay
 * a previously-prepared launch.
 */
export interface AgentLaunchBroadcastInput {
	agentId: string;
	walletAddress: Address;
	createArg: Hex;
	signature: Hex;
	/** BNB string for agent auto-buy at launch (e.g. "0.01"). Default 0. */
	preSale?: string;
}

/**
 * Persona persistence hook. The orchestrator calls `writeInitial` right
 * after Steward wallet provisioning (token address unknown) and `setToken`
 * after the on-chain TokenCreate is observed. Both are best-effort — if
 * they throw, the orchestrator logs via `onStep` and continues.
 *
 * Decoupled from `@waifufun/db` so the orchestrator package stays free of a
 * database dependency.
 */
export interface PersonaStore {
	writeInitial: (args: {
		agentId: string;
		walletAddress: Address;
		name: string;
		bio?: string;
		avatarUrl?: string;
		persona?: AgentPersonaConfig;
		taxVaultAddress?: Address;
	}) => Promise<void>;
	setToken: (agentId: string, tokenAddress: Address, taxVaultAddress?: Address) => Promise<void>;
	/**
	 * Persist the EIP-8004 identity details onto the persona metadata after a
	 * successful register. Optional — impls can no-op if they don't care.
	 */
	setIdentity?: (
		agentId: string,
		identity: {
			identityRegistrationStatus: IdentityRegistrationStatus;
			eip8004TokenId?: string;
			contractAddress?: string;
			txHash?: string;
			agentURI?: string;
			error?: string;
		},
	) => Promise<void>;
}

export interface OrchestratorDeps {
	steward: StewardClient;
	/** BSC public RPC URL. */
	rpcUrl: string;
	/** chainId: 56 (mainnet) or 97 (testnet). */
	chainId: 56 | 97;
	/** Override TokenManager2 address (optional — defaults based on chainId). */
	tokenManager2Address?: Address;
	/** Override Four.Meme base URL (staging/mocks). */
	fourMemeBaseUrl?: string;
	/** Launch fee in wei. Default 0.01 BNB. */
	launchFeeWei?: bigint;
	/** Used only for the platformId sent to Steward. */
	platformSlug?: string;
	/**
	 * Optional persona persistence hook. If omitted, persona data is not
	 * stored anywhere — the orchestrator still runs end-to-end, but the
	 * agent-personas table won't be populated. Failures are swallowed (logged
	 * via `onStep`) so a DB outage can't block a real token launch.
	 */
	personaStore?: PersonaStore;
	/**
	 * EIP-8004 agent identity NFT contract. Defaults to the BSC mainnet
	 * deployment `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. Callers can
	 * override via env (see routes/v2/agents.ts).
	 */
	eip8004NftAddress?: Address;
	/** Factory used to deploy immutable per-agent TaxSplitter recipients. */
	taxSplitterFactoryAddress?: Address;
	/**
	 * If true, identity registration failures are logged (via `onStep`) and
	 * the launch continues without the (AI) badge. Default true — we don't
	 * want a flaky NFT mint to block a token launch.
	 */
	continueOnIdentityFailure?: boolean;
	/** Receipt wait timeout in ms. Default 180_000 (3 min). */
	receiptTimeoutMs?: number;
	/** Injected fetch for tests. */
	fetchImpl?: typeof fetch;
	/** Hook called after each successful step — for structured logging. */
	onStep?: (step: string, detail: Record<string, unknown>) => void;
}

// four.meme's TokenManager2.createToken expects value=0 by default.
// Their official SDK sends `creationFeeWei` of 0n unless CREATION_FEE_WEI
// env var overrides. We mirror that here. Override via orchestrator deps
// if four.meme ever starts charging an onchain creation fee.
const DEFAULT_LAUNCH_FEE_WEI = 0n;

const TaxSplitterFactoryAbi = [
	{
		type: "function",
		name: "deploy",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "recipients", type: "address[]" },
			{ name: "bpsRates", type: "uint16[]" },
			{ name: "salt", type: "bytes32" },
		],
		outputs: [{ name: "splitter", type: "address" }],
	},
	{
		type: "function",
		name: "predict",
		stateMutability: "view",
		inputs: [
			{ name: "recipients", type: "address[]" },
			{ name: "bpsRates", type: "uint16[]" },
			{ name: "salt", type: "bytes32" },
		],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "event",
		name: "SplitterDeployed",
		inputs: [
			{ name: "splitter", type: "address", indexed: false },
			{ name: "recipients", type: "address[]", indexed: false },
			{ name: "bpsRates", type: "uint16[]", indexed: false },
		],
	},
] as const;

interface PreparedTaxSplit {
	agentBps: number;
	patronBps: number;
	patronAddress?: Address;
	splitterAddress?: Address;
}

interface TaxRecipientResolution {
	treasury: Address;
	taxSplit?: PreparedTaxSplit;
}

function identityFailureStatus(err: unknown): IdentityRegistrationStatus {
	const cause = err instanceof AgentLaunchError ? err.cause : undefined;
	if (isPendingApproval(cause as never)) return "pending_approval";
	return "failed";
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export class AgentLaunchOrchestrator {
	constructor(private readonly deps: OrchestratorDeps) {}

	async launch(input: AgentLaunchInput): Promise<AgentLaunchResult> {
		const agentId = input.agentId ?? this.generateAgentId(input.symbol);
		const tenantId = input.tenantId ?? "waifu";

		// ---- 1. Steward wallet provisioning ----
		const wallet = await this.step("steward.provision", async () => {
			if (input.existingAgent) {
				return {
					agentId: input.existingAgent.agentId,
					walletAddress: getAddress(input.existingAgent.walletAddress),
					tenantId,
				};
			}
			const identity = await this.deps.steward.ensureAgent(agentId, input.name, this.deps.platformSlug ?? "waifu");
			return {
				agentId: identity.id,
				walletAddress: getAddress(identity.walletAddress),
				tenantId: identity.tenantId,
			};
		}).catch((err) => {
			throw rethrow("steward.provision", err);
		});

		const taxRecipient = await this.resolveTaxRecipient(input, wallet);
		const treasury = taxRecipient.treasury;

		// ---- 1.1. Persona persistence (best-effort) ----
		// Write the persona row now with tokenAddress = null. We'll patch in
		// the token address once the on-chain launch succeeds. Failures here
		// must NOT block the launch — log and continue.
		if (this.deps.personaStore) {
			try {
				await this.deps.personaStore.writeInitial({
					agentId: wallet.agentId,
					walletAddress: wallet.walletAddress,
					name: input.name,
					...(input.description !== undefined ? { bio: input.description } : {}),
					...(input.imageUrl !== undefined ? { avatarUrl: input.imageUrl } : {}),
					...(input.persona !== undefined ? { persona: input.persona } : {}),
					...(treasury !== zeroAddress ? { taxVaultAddress: treasury } : {}),
				});
				this.deps.onStep?.("persona.write", { agentId: wallet.agentId });
			} catch (err) {
				this.deps.onStep?.("persona.write.warning", {
					agentId: wallet.agentId,
					error: err instanceof Error ? err.message : String(err),
					continuing: true,
				});
			}
		}

		// ---- 1.5. EIP-8004 agent identity NFT registration ----
		// Register the identity BEFORE SIWE login so the `creator → NFT →
		// AgentIdentifier` chain resolves by the time Four.Meme's backend signs
		// the createToken args. Without this the token won't get the (AI) badge.
		let identity: RegisterAgentIdentityResult | null = null;
		let identityRegistrationStatus: IdentityRegistrationStatus = "skipped";
		if (input.skipIdentityRegistration !== true) {
			const { publicClient } = this.buildChainClients();
			const identityContract =
				input.identityContractAddress ?? this.deps.eip8004NftAddress ?? DEFAULT_EIP8004_NFT_ADDRESS;
			const signer: Eip8004Signer = {
				sendTransaction: async (args) => {
					const result = await this.deps.steward.signTransaction(wallet.agentId, {
						to: args.to,
						data: args.data,
						value: (args.value ?? 0n).toString(),
						chainId: this.deps.chainId,
						broadcast: true,
					});
					if (isPendingApproval(result)) {
						throw new AgentLaunchError(
							"identity.register",
							"Steward returned pending_approval for EIP-8004 register — agent wallet policy requires manual approval",
							result,
						);
					}
					if (!isBroadcastResult(result)) {
						throw new AgentLaunchError(
							"identity.register",
							"Steward did not broadcast the EIP-8004 register tx",
							result,
						);
					}
					return result.txHash;
				},
			};

			try {
				identity = await this.step("identity.register", async () => {
					return registerAgentIdentity({
						signer,
						publicClient,
						name: input.name,
						...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
						...(input.description !== undefined ? { description: input.description } : {}),
						contractAddress: identityContract,
						chainId: this.deps.chainId,
						...(this.deps.receiptTimeoutMs !== undefined ? { receiptTimeoutMs: this.deps.receiptTimeoutMs } : {}),
					});
				});
				identityRegistrationStatus = "minted";
				// Persist identity metadata for the UI to surface (EIP-8004 badge, etc.)
				if (identity && this.deps.personaStore?.setIdentity) {
					try {
						await this.deps.personaStore.setIdentity(wallet.agentId, {
							identityRegistrationStatus,
							eip8004TokenId: identity.agentId.toString(),
							contractAddress: identity.contractAddress,
							txHash: identity.txHash,
							agentURI: identity.agentURI,
						});
					} catch (e) {
						this.deps.onStep?.("identity.persist.warning", {
							error: e instanceof Error ? e.message : String(e),
						});
					}
				}
			} catch (err) {
				// Per-launch `strictIdentityRegistration` wins; falls back to the
				// orchestrator-level default (`continueOnIdentityFailure`, default
				// true — i.e. non-strict). We don't want a flaky NFT mint to block
				// a token launch unless the caller explicitly opts in.
				const strict = input.strictIdentityRegistration === true || this.deps.continueOnIdentityFailure === false;
				if (strict) {
					throw rethrow("identity.register", err);
				}
				// Non-fatal: log + continue. The token launch still succeeds, it
				// just won't carry the (AI) badge in Four.Meme's UI.
				identityRegistrationStatus = identityFailureStatus(err);
				const message = errorMessage(err);
				this.deps.onStep?.("identity.register.warning", {
					error: message,
					identityRegistrationStatus,
					continuing: true,
				});
				if (this.deps.personaStore?.setIdentity) {
					await this.deps.personaStore
						.setIdentity(wallet.agentId, {
							identityRegistrationStatus,
							error: message,
						})
						.catch((e) => {
							this.deps.onStep?.("identity.persist.warning", {
								error: errorMessage(e),
							});
						});
				}
				identity = null;
			}
		}

		const fourMemeOpts: { baseUrl?: string; fetchImpl?: typeof fetch } = {};
		if (this.deps.fourMemeBaseUrl !== undefined) {
			fourMemeOpts.baseUrl = this.deps.fourMemeBaseUrl;
		}
		if (this.deps.fetchImpl !== undefined) {
			fourMemeOpts.fetchImpl = this.deps.fetchImpl;
		}

		// ---- 2. Four.Meme SIWE login ----
		const login = await this.step("fourmeme.login", async () => {
			return fourMemeLogin(
				wallet.walletAddress,
				async (_address, message) => {
					const result = await this.deps.steward.signMessage(wallet.agentId, message);
					if (!result?.signature) {
						throw new Error("Steward returned empty signature");
					}
					return result.signature;
				},
				fourMemeOpts,
			);
		}).catch((err) => {
			throw rethrow("fourmeme.login", err);
		});

		// ---- 3. Image upload ----
		const upload = await this.step("fourmeme.upload", async () => {
			return fourMemeUploadImage(
				login.accessToken,
				buildOptional({
					imageUrl: input.imageUrl,
					imageBase64: input.imageBase64,
					mimeType: input.imageMimeType,
					filename: input.imageFilename,
				}),
				fourMemeOpts,
			);
		}).catch((err) => {
			throw rethrow("fourmeme.upload", err);
		});

		// ---- 4. Create token (off-chain signed params) ----
		const tax: FourMemeTaxConfig | null = input.tax
			? {
					feeRate: input.tax.feeRate,
					burnRate: input.tax.burnRate,
					divideRate: input.tax.divideRate,
					liquidityRate: input.tax.liquidityRate,
					recipientRate: input.tax.recipientRate,
					recipientAddress: treasury,
					minSharing: input.tax.minSharing,
				}
			: null;

		const createApi: FourMemeCreateTokenInput = {
			name: input.name,
			shortName: input.symbol,
			desc: input.description,
			imgUrl: upload.imageUrl,
			tokenTaxInfo: tax,
			...buildOptional({
				label: input.label,
				launchTime: input.launchTime,
				webUrl: input.webUrl,
				twitterUrl: input.twitterUrl,
				telegramUrl: input.telegramUrl,
				preSale: input.preSale,
				onlyMPC: input.onlyMPC,
				feePlan: input.feePlan,
			}),
		};

		const created = await this.step("fourmeme.create", async () => {
			return fourMemeCreateToken(login.accessToken, createApi, fourMemeOpts);
		}).catch((err) => {
			throw rethrow("fourmeme.create", err);
		});

		// ---- 5. On-chain createToken via Steward ----
		const { tokenManager2Address, publicClient } = this.buildChainClients();

		const txData = encodeFunctionData({
			abi: TokenManager2Abi as unknown as readonly unknown[],
			functionName: "createToken",
			args: [created.createArg, created.signature],
		});

		const launchFee = this.deps.launchFeeWei ?? DEFAULT_LAUNCH_FEE_WEI;
		const presaleWei = input.preSale ? parseEther(input.preSale) : 0n;
		const totalValueWei = launchFee + presaleWei;

		const txHash = await this.step("chain.broadcast", async () => {
			const result = await this.deps.steward.signTransaction(wallet.agentId, {
				to: tokenManager2Address,
				data: txData,
				value: totalValueWei.toString(),
				chainId: this.deps.chainId,
				broadcast: true,
			});
			if (isPendingApproval(result)) {
				throw new AgentLaunchError(
					"chain.broadcast",
					"Steward returned pending_approval — agent wallet policy requires manual approval",
					result,
				);
			}
			if (!isBroadcastResult(result)) {
				throw new AgentLaunchError(
					"chain.broadcast",
					"Steward did not broadcast the tx (broadcast=true but no txHash returned)",
					result,
				);
			}
			return result.txHash;
		}).catch((err) => {
			throw rethrow("chain.broadcast", err);
		});

		// ---- 6. Wait for receipt + extract token address ----
		const tokenAddress = await this.step("chain.receipt", async () => {
			const receipt = await publicClient.waitForTransactionReceipt({
				hash: txHash,
				timeout: this.deps.receiptTimeoutMs ?? 180_000,
			});
			if (receipt.status !== "success") {
				throw new AgentLaunchError("chain.receipt", `createToken tx reverted (status=${receipt.status})`, {
					txHash,
					receipt,
				});
			}
			return parseTokenAddressFromLogs(receipt.logs, tokenManager2Address);
		}).catch((err) => {
			throw rethrow("chain.receipt", err);
		});

		// ---- 7. Persona: patch in token address (best-effort) ----
		if (this.deps.personaStore) {
			try {
				await this.deps.personaStore.setToken(wallet.agentId, tokenAddress);
				this.deps.onStep?.("persona.setToken", {
					agentId: wallet.agentId,
					tokenAddress,
				});
			} catch (err) {
				this.deps.onStep?.("persona.setToken.warning", {
					agentId: wallet.agentId,
					error: err instanceof Error ? err.message : String(err),
					continuing: true,
				});
			}
		}

		return {
			agentId: wallet.agentId,
			walletAddress: wallet.walletAddress,
			treasuryAddress: treasury,
			...(taxRecipient.taxSplit ? { taxSplit: taxRecipient.taxSplit } : {}),
			tokenAddress,
			txHash,
			fourMeme: {
				nonce: login.nonce,
				imageUrl: upload.imageUrl,
				createArgHash: hashHexPrefix(created.createArg),
				...(created.requestId ? { requestId: created.requestId } : {}),
			},
			identityRegistrationStatus,
			...(identity
				? {
						agentIdentity: {
							agentId: identity.agentId.toString(),
							txHash: identity.txHash,
							agentURI: identity.agentURI,
							contractAddress: identity.contractAddress,
						},
					}
				: {}),
		};
	}

	/**
	 * Prepare a launch without broadcasting the on-chain createToken tx.
	 *
	 * Runs steps 1–4 of the full launch: Steward wallet provisioning, EIP-8004
	 * identity registration, four.meme SIWE login, image upload, and the
	 * off-chain `/v1/private/token/create` call that returns
	 * `(createArg, signature)`.
	 *
	 * Callers should persist `createArg` + `signature` and later pass them
	 * to `broadcastPrepared()` to finish the launch. Four.meme's create
	 * response is time-sensitive (the signature embeds a launchTime) — treat
	 * the returned artifact as short-lived (hours, not days).
	 */
	async prepare(input: AgentLaunchInput): Promise<AgentLaunchPrepareResult> {
		const agentId = input.agentId ?? this.generateAgentId(input.symbol);
		const tenantId = input.tenantId ?? "waifu";

		const wallet = await this.step("steward.provision", async () => {
			if (input.existingAgent) {
				return {
					agentId: input.existingAgent.agentId,
					walletAddress: getAddress(input.existingAgent.walletAddress),
					tenantId,
				};
			}
			const ident = await this.deps.steward.ensureAgent(agentId, input.name, this.deps.platformSlug ?? "waifu");
			return {
				agentId: ident.id,
				walletAddress: getAddress(ident.walletAddress),
				tenantId: ident.tenantId,
			};
		}).catch((err) => {
			throw rethrow("steward.provision", err);
		});

		const taxRecipient = await this.resolveTaxRecipient(input, wallet);
		const treasury = taxRecipient.treasury;

		if (this.deps.personaStore) {
			try {
				await this.deps.personaStore.writeInitial({
					agentId: wallet.agentId,
					walletAddress: wallet.walletAddress,
					name: input.name,
					...(input.description !== undefined ? { bio: input.description } : {}),
					...(input.imageUrl !== undefined ? { avatarUrl: input.imageUrl } : {}),
					...(input.persona !== undefined ? { persona: input.persona } : {}),
					...(treasury !== zeroAddress ? { taxVaultAddress: treasury } : {}),
				});
				this.deps.onStep?.("persona.write", { agentId: wallet.agentId });
			} catch (err) {
				this.deps.onStep?.("persona.write.warning", {
					agentId: wallet.agentId,
					error: err instanceof Error ? err.message : String(err),
					continuing: true,
				});
			}
		}

		// EIP-8004 identity registration (same logic as launch()). Kept in
		// prepare so the four.meme create call sees the NFT and mints the (AI) badge.
		let identity: RegisterAgentIdentityResult | null = null;
		let identityRegistrationStatus: IdentityRegistrationStatus = "skipped";
		if (input.skipIdentityRegistration !== true) {
			const identityContract =
				input.identityContractAddress ?? this.deps.eip8004NftAddress ?? DEFAULT_EIP8004_NFT_ADDRESS;
			const signer: Eip8004Signer = {
				sendTransaction: async (args) => {
					const result = await this.deps.steward.signTransaction(wallet.agentId, {
						to: args.to,
						data: args.data,
						value: (args.value ?? 0n).toString(),
						chainId: this.deps.chainId,
						broadcast: true,
					});
					if (isPendingApproval(result)) {
						throw new AgentLaunchError(
							"identity.register",
							"Steward returned pending_approval for EIP-8004 register — agent wallet policy requires manual approval",
							result,
						);
					}
					if (!isBroadcastResult(result)) {
						throw new AgentLaunchError(
							"identity.register",
							"Steward did not broadcast the EIP-8004 register tx",
							result,
						);
					}
					return result.txHash;
				},
			};
			try {
				identity = await this.step("identity.register", async () => {
					return registerAgentIdentity({
						signer,
						publicClient: this.buildChainClients().publicClient,
						name: input.name,
						...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
						...(input.description !== undefined ? { description: input.description } : {}),
						contractAddress: identityContract,
						chainId: this.deps.chainId,
						...(this.deps.receiptTimeoutMs !== undefined ? { receiptTimeoutMs: this.deps.receiptTimeoutMs } : {}),
					});
				});
				identityRegistrationStatus = "minted";
				if (identity && this.deps.personaStore?.setIdentity) {
					try {
						await this.deps.personaStore.setIdentity(wallet.agentId, {
							identityRegistrationStatus,
							eip8004TokenId: identity.agentId.toString(),
							contractAddress: identity.contractAddress,
							txHash: identity.txHash,
							agentURI: identity.agentURI,
						});
					} catch (err) {
						this.deps.onStep?.("persona.setIdentity.warning", {
							agentId: wallet.agentId,
							error: err instanceof Error ? err.message : String(err),
							continuing: true,
						});
					}
				}
			} catch (err) {
				const strict = input.strictIdentityRegistration === true || this.deps.continueOnIdentityFailure === false;
				if (strict) {
					throw rethrow("identity.register", err);
				}
				identityRegistrationStatus = identityFailureStatus(err);
				const message = errorMessage(err);
				this.deps.onStep?.("identity.register.warning", {
					error: message,
					identityRegistrationStatus,
					continuing: true,
				});
				if (this.deps.personaStore?.setIdentity) {
					await this.deps.personaStore
						.setIdentity(wallet.agentId, {
							identityRegistrationStatus,
							error: message,
						})
						.catch((e) => {
							this.deps.onStep?.("persona.setIdentity.warning", {
								error: errorMessage(e),
							});
						});
				}
				identity = null;
			}
		}

		const fourMemeOpts: { baseUrl?: string; fetchImpl?: typeof fetch } = {};
		if (this.deps.fourMemeBaseUrl !== undefined) {
			fourMemeOpts.baseUrl = this.deps.fourMemeBaseUrl;
		}
		if (this.deps.fetchImpl !== undefined) {
			fourMemeOpts.fetchImpl = this.deps.fetchImpl;
		}

		const login = await this.step("fourmeme.login", async () => {
			return fourMemeLogin(
				wallet.walletAddress,
				async (_address, message) => {
					const result = await this.deps.steward.signMessage(wallet.agentId, message);
					if (!result?.signature) {
						throw new Error("Steward returned empty signature");
					}
					return result.signature;
				},
				fourMemeOpts,
			);
		}).catch((err) => {
			throw rethrow("fourmeme.login", err);
		});

		const upload = await this.step("fourmeme.upload", async () => {
			return fourMemeUploadImage(
				login.accessToken,
				buildOptional({
					imageUrl: input.imageUrl,
					imageBase64: input.imageBase64,
					mimeType: input.imageMimeType,
					filename: input.imageFilename,
				}),
				fourMemeOpts,
			);
		}).catch((err) => {
			throw rethrow("fourmeme.upload", err);
		});

		const tax: FourMemeTaxConfig | null = input.tax
			? {
					feeRate: input.tax.feeRate,
					burnRate: input.tax.burnRate,
					divideRate: input.tax.divideRate,
					liquidityRate: input.tax.liquidityRate,
					recipientRate: input.tax.recipientRate,
					recipientAddress: treasury,
					minSharing: input.tax.minSharing,
				}
			: null;

		const createApi: FourMemeCreateTokenInput = {
			name: input.name,
			shortName: input.symbol,
			desc: input.description,
			imgUrl: upload.imageUrl,
			tokenTaxInfo: tax,
			...buildOptional({
				label: input.label,
				launchTime: input.launchTime,
				webUrl: input.webUrl,
				twitterUrl: input.twitterUrl,
				telegramUrl: input.telegramUrl,
				preSale: input.preSale,
				onlyMPC: input.onlyMPC,
				feePlan: input.feePlan,
			}),
		};

		const created = await this.step("fourmeme.create", async () => {
			return fourMemeCreateToken(login.accessToken, createApi, fourMemeOpts);
		}).catch((err) => {
			throw rethrow("fourmeme.create", err);
		});

		return {
			agentId: wallet.agentId,
			walletAddress: wallet.walletAddress,
			treasuryAddress: treasury,
			...(taxRecipient.taxSplit ? { taxSplit: taxRecipient.taxSplit } : {}),
			createArg: created.createArg,
			signature: created.signature,
			...(created.requestId ? { requestId: created.requestId } : {}),
			fourMeme: {
				nonce: login.nonce,
				imageUrl: upload.imageUrl,
				createArgHash: hashHexPrefix(created.createArg),
			},
			identityRegistrationStatus,
			...(identity
				? {
						agentIdentity: {
							agentId: identity.agentId.toString(),
							txHash: identity.txHash,
							agentURI: identity.agentURI,
							contractAddress: identity.contractAddress,
						},
					}
				: {}),
		};
	}

	/**
	 * Broadcast a previously-prepared launch. Runs only the on-chain steps
	 * (createToken tx + receipt polling + persona.setToken). Expects the
	 * caller to pass the `(createArg, signature)` returned by `prepare()`.
	 *
	 * The agent wallet must already have enough BNB for gas (+ `preSale` if
	 * non-zero). No launch fee is charged on-chain today — four.meme takes
	 * its cut at the bonding-curve level via `buyFee`/`sellFee`.
	 */
	async broadcastPrepared(input: AgentLaunchBroadcastInput): Promise<{ txHash: Hex; tokenAddress: Address }> {
		const { tokenManager2Address, publicClient } = this.buildChainClients();

		const txData = encodeFunctionData({
			abi: TokenManager2Abi as unknown as readonly unknown[],
			functionName: "createToken",
			args: [input.createArg, input.signature],
		});

		const launchFee = this.deps.launchFeeWei ?? DEFAULT_LAUNCH_FEE_WEI;
		const presaleWei = input.preSale ? parseEther(input.preSale) : 0n;
		const totalValueWei = launchFee + presaleWei;

		const txHash = await this.step("chain.broadcast", async () => {
			const result = await this.deps.steward.signTransaction(input.agentId, {
				to: tokenManager2Address,
				data: txData,
				value: totalValueWei.toString(),
				chainId: this.deps.chainId,
				broadcast: true,
			});
			if (isPendingApproval(result)) {
				throw new AgentLaunchError(
					"chain.broadcast",
					"Steward returned pending_approval — agent wallet policy requires manual approval",
					result,
				);
			}
			if (!isBroadcastResult(result)) {
				throw new AgentLaunchError(
					"chain.broadcast",
					"Steward did not broadcast the tx (broadcast=true but no txHash returned)",
					result,
				);
			}
			return result.txHash;
		}).catch((err) => {
			throw rethrow("chain.broadcast", err);
		});

		const tokenAddress = await this.step("chain.receipt", async () => {
			const receipt = await publicClient.waitForTransactionReceipt({
				hash: txHash,
				timeout: this.deps.receiptTimeoutMs ?? 180_000,
			});
			if (receipt.status !== "success") {
				throw new AgentLaunchError("chain.receipt", `createToken tx reverted (status=${receipt.status})`, {
					txHash,
					receipt,
				});
			}
			return parseTokenAddressFromLogs(receipt.logs, tokenManager2Address);
		}).catch((err) => {
			throw rethrow("chain.receipt", err);
		});

		if (this.deps.personaStore) {
			try {
				await this.deps.personaStore.setToken(input.agentId, tokenAddress);
				this.deps.onStep?.("persona.setToken", {
					agentId: input.agentId,
					tokenAddress,
				});
			} catch (err) {
				this.deps.onStep?.("persona.setToken.warning", {
					agentId: input.agentId,
					error: err instanceof Error ? err.message : String(err),
					continuing: true,
				});
			}
		}

		return { txHash, tokenAddress };
	}

	// ---------------- internals ----------------

	private async resolveTaxRecipient(
		input: AgentLaunchInput,
		wallet: { agentId: string; walletAddress: Address },
	): Promise<TaxRecipientResolution> {
		const fallbackTreasury = input.tax?.recipientAddress
			? getAddress(input.tax.recipientAddress)
			: wallet.walletAddress;
		const split = input.taxSplit;
		if (!input.tax || !split) {
			return { treasury: fallbackTreasury };
		}
		const platformBps = split.platformAddress ? (split.platformBps ?? 0) : 0;
		if (
			split.agentBps < 0 ||
			split.patronBps < 0 ||
			platformBps < 0 ||
			split.agentBps + split.patronBps + platformBps !== 10000
		) {
			throw new AgentLaunchError(
				"tax.split",
				"taxSplit agentBps, patronBps, and optional platformBps must be non-negative and sum to 10000",
				split,
			);
		}

		if (split.splitterAddress) {
			const splitterAddress = getAddress(split.splitterAddress);
			return {
				treasury: splitterAddress,
				taxSplit: { ...split, splitterAddress },
			};
		}

		if (!split.platformAddress && split.patronBps <= 0) {
			return { treasury: fallbackTreasury, taxSplit: split };
		}
		if (!split.patronAddress && split.patronBps > 0) {
			return { treasury: fallbackTreasury, taxSplit: split };
		}
		const recipients: Address[] = [];
		const bpsRates: number[] = [];
		if (split.platformAddress && platformBps > 0) {
			recipients.push(getAddress(split.platformAddress));
			bpsRates.push(platformBps);
		}
		if (split.agentBps > 0) {
			recipients.push(wallet.walletAddress);
			bpsRates.push(split.agentBps);
		}
		const patronAddress = split.patronAddress ? getAddress(split.patronAddress) : zeroAddress;
		if (split.patronBps > 0) {
			recipients.push(patronAddress);
			bpsRates.push(split.patronBps);
		}
		if (recipients.length === 1) {
			return { treasury: recipients[0] ?? fallbackTreasury, taxSplit: split };
		}
		if (recipients.length === 0) {
			return { treasury: fallbackTreasury, taxSplit: split };
		}
		if (!this.deps.taxSplitterFactoryAddress) {
			throw new AgentLaunchError(
				"tax.split.deploy",
				"TAX_SPLITTER_FACTORY_ADDRESS is required to deploy multi-recipient tax splitters",
			);
		}
		const factoryAddress = getAddress(this.deps.taxSplitterFactoryAddress);
		const salt = keccak256(
			encodeAbiParameters(
				[
					{ name: "agentId", type: "string" },
					{ name: "agent", type: "address" },
					{ name: "patron", type: "address" },
					{ name: "platform", type: "address" },
					{ name: "agentBps", type: "uint16" },
					{ name: "patronBps", type: "uint16" },
					{ name: "platformBps", type: "uint16" },
				],
				[
					wallet.agentId,
					wallet.walletAddress,
					patronAddress,
					split.platformAddress ? getAddress(split.platformAddress) : zeroAddress,
					split.agentBps,
					split.patronBps,
					platformBps,
				],
			),
		);
		const { publicClient } = this.buildChainClients();
		const predicted = getAddress(
			await publicClient.readContract({
				address: factoryAddress,
				abi: TaxSplitterFactoryAbi,
				functionName: "predict",
				args: [recipients, bpsRates, salt],
			}),
		);
		const existingCode = await publicClient.getBytecode({ address: predicted });
		if (existingCode && existingCode !== "0x") {
			return {
				treasury: predicted,
				taxSplit: { ...split, patronAddress, splitterAddress: predicted },
			};
		}

		const data = encodeFunctionData({
			abi: TaxSplitterFactoryAbi,
			functionName: "deploy",
			args: [recipients, bpsRates, salt],
		});
		const txHash = await this.step("tax.split.deploy", async () => {
			const result = await this.deps.steward.signTransaction(wallet.agentId, {
				to: factoryAddress,
				data,
				value: "0",
				chainId: this.deps.chainId,
				broadcast: true,
			});
			if (isPendingApproval(result)) {
				throw new AgentLaunchError(
					"tax.split.deploy",
					"Steward returned pending_approval for TaxSplitter deploy — agent wallet policy requires manual approval",
					result,
				);
			}
			if (!isBroadcastResult(result)) {
				throw new AgentLaunchError("tax.split.deploy", "Steward did not broadcast the TaxSplitter deploy tx", result);
			}
			return result.txHash;
		});

		const receipt = await publicClient.waitForTransactionReceipt({
			hash: txHash,
			timeout: this.deps.receiptTimeoutMs ?? 180_000,
		});
		if (receipt.status !== "success") {
			throw new AgentLaunchError("tax.split.deploy", "TaxSplitter deploy tx reverted", {
				txHash,
				receipt,
			});
		}
		const splitterAddress = parseSplitterAddressFromLogs(receipt.logs, factoryAddress) ?? predicted;
		return {
			treasury: splitterAddress,
			taxSplit: { ...split, patronAddress, splitterAddress },
		};
	}

	private buildChainClients(): {
		tokenManager2Address: Address;
		publicClient: PublicClient;
	} {
		const chainKey = this.deps.chainId === 56 ? "bsc" : "bscTestnet";
		const fourMemeClient = createFourMemeClient({
			chain: chainKey,
			rpcUrl: this.deps.rpcUrl,
		});
		const tm2 = this.deps.tokenManager2Address ?? getAddress(fourMemeClient.addresses.tokenManager2);
		return {
			tokenManager2Address: tm2,
			publicClient: fourMemeClient.publicClient,
		};
	}

	private generateAgentId(symbol: string): string {
		const slug =
			symbol
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "")
				.slice(0, 16) || "agent";
		// 8 bytes of entropy keeps it short + readable.
		const bytes = new Uint8Array(8);
		globalThis.crypto.getRandomValues(bytes);
		const suffix = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
		return `waifu-${slug}-${suffix}`;
	}

	private async step<T>(step: string, fn: () => Promise<T>): Promise<T> {
		const result = await fn();
		this.deps.onStep?.(step, safeStepDetail(result));
		return result;
	}
}

function rethrow(step: string, err: unknown): AgentLaunchError {
	if (err instanceof AgentLaunchError) return err;
	if (err instanceof StewardError) {
		return new AgentLaunchError(step, `Steward ${err.status}: ${err.message}`, err);
	}
	if (err instanceof Error) {
		return new AgentLaunchError(step, err.message, err);
	}
	return new AgentLaunchError(step, String(err), err);
}

function parseSplitterAddressFromLogs(
	logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[],
	factoryAddress: Address,
): Address | null {
	const lcFactory = factoryAddress.toLowerCase();
	for (const log of logs) {
		if (log.address.toLowerCase() !== lcFactory) continue;
		try {
			const decoded = decodeEventLog({
				abi: TaxSplitterFactoryAbi,
				topics: log.topics as [Hex, ...Hex[]],
				data: log.data,
			});
			if (decoded.eventName === "SplitterDeployed") {
				const args = decoded.args as unknown as { splitter?: Address } | readonly unknown[];
				const splitter = Array.isArray(args)
					? (args[0] as Address | undefined)
					: (args as { splitter?: Address }).splitter;
				if (splitter) return getAddress(splitter);
			}
		} catch {
			// non-SplitterDeployed log from the factory — skip
		}
	}
	return null;
}

function parseTokenAddressFromLogs(
	logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[],
	tokenManager2Address: Address,
): Address {
	const lcTm2 = tokenManager2Address.toLowerCase();
	for (const log of logs) {
		if (log.address.toLowerCase() !== lcTm2) continue;
		try {
			const decoded = decodeEventLog({
				abi: TokenManager2Abi,
				topics: log.topics as [Hex, ...Hex[]],
				data: log.data,
			});
			if (decoded.eventName === "TokenCreate") {
				// V2 TokenCreate args: (creator, token, requestId, name, symbol, totalSupply, launchTime, launchFee)
				const args = decoded.args as unknown as { token?: Address } | Record<string, unknown>;
				const token = (args as { token?: Address }).token ?? (Array.isArray(args) ? (args[1] as Address) : undefined);
				if (token) return getAddress(token);
			}
		} catch {
			// non-TokenCreate log from TokenManager2 — skip
		}
	}
	throw new AgentLaunchError(
		"chain.receipt",
		"could not locate TokenCreate event in tx receipt — token address unknown",
	);
}

function hashHexPrefix(hex: Hex): string {
	// Cheap identifier for logs — first 16 hex chars of createArg
	return hex.slice(0, 18);
}

/**
 * Strip `undefined` fields so spreading the result into a type with
 * `exactOptionalPropertyTypes` doesn't widen the field to `T | undefined`.
 */
function buildOptional<T extends Record<string, unknown>>(input: T): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(input)) {
		if (v !== undefined) out[k] = v;
	}
	return out as Partial<T>;
}

function safeStepDetail(value: unknown): Record<string, unknown> {
	if (value === null || value === undefined) return {};
	if (typeof value !== "object") return { value: String(value) };
	// Avoid logging secrets (accessToken, signature). Redact by key name.
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (/token|secret|signature|signedTx|pk|key/i.test(k) && typeof v === "string") {
			out[k] = `[redacted ${k}]`;
		} else if (typeof v === "bigint") {
			out[k] = v.toString();
		} else if (typeof v === "object" && v !== null) {
			out[k] = "[object]";
		} else {
			out[k] = v;
		}
	}
	return out;
}

export function createOrchestrator(deps: OrchestratorDeps): AgentLaunchOrchestrator {
	return new AgentLaunchOrchestrator(deps);
}
