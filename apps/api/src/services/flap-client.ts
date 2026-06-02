import type { PublicClient } from "viem";
import { encodeFunctionData, parseEther } from "viem";

import {
	FLAP_DEFAULT_QUOTE_TOKEN,
	buildNewTokenV5Params,
	buildSwapExactInputWrite,
	createFlapPublicClient,
	portalAbi,
	quoteBuyExactInput,
	quoteSellExactInput,
	resolveFlapNetwork,
} from "@waifufun/flap";

import type { LaunchRecord } from "../contracts/launches.js";
import type { AppConfig, FlapClient } from "../contracts/services.js";
import type { TradeQuoteInput } from "../contracts/trades.js";

export function createFlapClient(config: AppConfig): FlapClient {
	const publicClient: PublicClient = createFlapPublicClient({
		chainId: config.chain.chainId as 56 | 97,
		rpcUrl: config.chain.rpcUrl,
	});

	const network = resolveFlapNetwork({ chainId: config.chain.chainId as 56 | 97 });
	const portalAddress = config.chain.portalAddress as `0x${string}`;

	return {
		async ping() {
			try {
				await publicClient.getBlockNumber();
				return true;
			} catch {
				return false;
			}
		},

		async health() {
			try {
				const blockNumber = await publicClient.getBlockNumber();
				return {
					ok: true,
					provider: "real-flap-client",
					notes: [`BSC RPC: ${config.chain.rpcUrl}`, `Portal: ${portalAddress}`, `Latest block: ${blockNumber}`],
				};
			} catch (error) {
				return {
					ok: false,
					provider: "real-flap-client",
					notes: [
						`BSC RPC: ${config.chain.rpcUrl}`,
						`Error: ${error instanceof Error ? error.message : String(error)}`,
					],
				};
			}
		},

		async prepareLaunchPayload(launch: LaunchRecord) {
			const requiresTaxSuffix = launch.taxRateBps > 0;
			const requiredSuffix = requiresTaxSuffix ? "7777" : "8888";
			const saltReady = Boolean(launch.salt);
			const metadataReady = Boolean(launch.metadataCid);

			// If still pending review, return early with pending status
			if (launch.status === "pending") {
				return {
					readiness: "pending_review" as const,
					mode: "user-signed" as const,
					chainId: config.chain.chainId,
					portalAddress,
					metadata: {
						status: "pending" as const,
						cid: launch.metadataCid,
						notes: ["Launch is gated by review before async preparation starts."],
					},
					salt: {
						status: "pending" as const,
						value: launch.salt,
						requiredSuffix,
					},
					params: {
						name: launch.name,
						symbol: launch.symbol,
						meta: launch.metadataCid ?? "PENDING_METADATA_CID",
						quoteToken: FLAP_DEFAULT_QUOTE_TOKEN,
						taxRate: launch.taxRateBps,
						beneficiary: launch.creatorAddress,
						salt: launch.salt,
						migratorType: requiresTaxSuffix ? ("V2_MIGRATOR" as const) : ("V3_MIGRATOR" as const),
						dexId: "DEX0" as const,
						lpFeeProfile: "LP_FEE_PROFILE_STANDARD" as const,
					},
					nextAction: "await_admin_review" as const,
					notes: ["Curated launch policy is active; approval is required before payload finalization."],
				};
			}

			// Build the params using the @waifufun/flap utility
			const params = buildNewTokenV5Params({
				name: launch.name,
				symbol: launch.symbol,
				meta: launch.metadataCid ?? "TODO_METADATA_CID",
				salt: (launch.salt as `0x${string}`) ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
				beneficiary: launch.creatorAddress as `0x${string}`,
				taxRate: launch.taxRateBps,
				quoteToken: FLAP_DEFAULT_QUOTE_TOKEN,
				quoteAmt: launch.initialBuyBnb ? parseEther(launch.initialBuyBnb) : 0n,
			});

			// Encode the transaction data
			const data = encodeFunctionData({
				abi: portalAbi,
				functionName: "newTokenV5",
				args: [params],
			});

			// Estimate gas (rough estimate, actual will be determined client-side)
			const estimatedGas = 500_000n;

			return {
				readiness: saltReady && metadataReady ? ("ready" as const) : ("preparing" as const),
				mode: "user-signed" as const,
				chainId: config.chain.chainId,
				portalAddress,
				metadata: {
					status: metadataReady ? ("uploaded" as const) : ("compat-placeholder" as const),
					cid: launch.metadataCid,
					notes: metadataReady
						? ["Metadata CID is present on the launch record."]
						: ["Metadata upload in progress via worker."],
				},
				salt: {
					status: saltReady ? ("ready" as const) : ("compat-placeholder" as const),
					value: launch.salt,
					requiredSuffix,
				},
				params: {
					name: launch.name,
					symbol: launch.symbol,
					meta: launch.metadataCid ?? "TODO_FLAP_METADATA_CID",
					quoteToken: FLAP_DEFAULT_QUOTE_TOKEN,
					taxRate: launch.taxRateBps,
					beneficiary: launch.creatorAddress,
					salt: launch.salt,
					migratorType: requiresTaxSuffix ? ("V2_MIGRATOR" as const) : ("V3_MIGRATOR" as const),
					dexId: "DEX0" as const,
					lpFeeProfile: "LP_FEE_PROFILE_STANDARD" as const,
				},
				txData: data,
				estimatedGas: estimatedGas.toString(),
				nextAction:
					saltReady && metadataReady ? ("sign_and_submit_transaction" as const) : ("await_async_preparation" as const),
				notes: ["Real Flap client with on-chain call encoding."],
			};
		},

		async quoteExactInput(input: TradeQuoteInput) {
			const tokenAddress = input.tokenAddress as `0x${string}`;
			const amount = parseEther(input.amount);

			try {
				let outputAmount: bigint;

				if (input.side === "buy") {
					outputAmount = await quoteBuyExactInput(publicClient, {
						token: tokenAddress,
						inputAmount: amount,
						portalAddress,
						chainId: config.chain.chainId,
					});
				} else {
					outputAmount = await quoteSellExactInput(publicClient, {
						token: tokenAddress,
						inputAmount: amount,
						portalAddress,
						chainId: config.chain.chainId,
					});
				}

				const outputFormatted = (Number(outputAmount) / 1e18).toFixed(18);

				return {
					tokenAddress: input.tokenAddress,
					side: input.side,
					inputAmount: input.amount,
					outputAmount: outputFormatted,
					quoteToken: "BNB" as const,
					estimatedFeeBps: 100, // Flap protocol fee
					slippageBps: input.slippageBps,
					source: "real-flap-rpc" as const,
					expiresAt: new Date(Date.now() + 30_000).toISOString(),
				};
			} catch (error) {
				throw new Error(
					`Failed to quote ${input.side} for ${input.tokenAddress}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},

		async prepareSwap(input: TradeQuoteInput & { traderAddress: string }) {
			// Get a fresh quote
			const quote = await this.quoteExactInput(input);

			const tokenAddress = input.tokenAddress as `0x${string}`;
			const inputAmount = parseEther(input.amount);
			const outputAmount = parseEther(quote.outputAmount);

			// Apply slippage to min output using exact bigint math (float64 loses
			// precision on 18-decimal wei values, corrupting the on-chain floor).
			const minOutputAmount = (outputAmount * BigInt(10_000 - input.slippageBps)) / 10_000n;

			// Build swap params
			const swapParams =
				input.side === "buy"
					? {
							inputToken: FLAP_DEFAULT_QUOTE_TOKEN,
							outputToken: tokenAddress,
							inputAmount,
							minOutputAmount,
							permitData: "0x" as `0x${string}`,
						}
					: {
							inputToken: tokenAddress,
							outputToken: FLAP_DEFAULT_QUOTE_TOKEN,
							inputAmount,
							minOutputAmount,
							permitData: "0x" as `0x${string}`,
						};

			const writeConfig = buildSwapExactInputWrite({
				params: swapParams,
				chainId: config.chain.chainId,
				portalAddress,
				value: input.side === "buy" ? inputAmount : 0n,
			});

			return {
				traderAddress: input.traderAddress,
				quote,
				call: {
					contractAddress: portalAddress,
					method: "swapExactInput" as const,
					calldata: encodeFunctionData({
						abi: portalAbi,
						functionName: "swapExactInput",
						args: [swapParams],
					}),
					permitData: "0x" as const,
					value: (input.side === "buy" ? inputAmount : 0n).toString(),
				},
				notes: ["Real swap preparation with live slippage protection."],
			};
		},
	};
}
