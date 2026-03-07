import type { FastifyInstance } from "fastify";
import { ABIS } from "@waifufun/constants";
import { EVMRpcProvider } from "@waifufun/rpc";
import type { IRecentTransaction, TChain, TChainId, TSupportProtocol } from "@waifufun/types";
import { isChainIdAllowedForChain } from "@waifufun/utils";
import { parseEventLogs, erc20Abi, getAddress, type Address, formatUnits, type Hash } from "viem";

import DB from "@waifufun/database";
import { Claimer } from "@waifufun/migrations";
import type { SolanaNetworkIds } from "@waifufun/types";
import { getTokenRuntimeContext, upsertRuntimeRecord } from "../services/owner-runtime-control-plane";

interface TransferEventArgs {
	from: Address;
	to: Address;
	value: bigint | string;
}

const findTransfer = (
	logs: { args: TransferEventArgs; address: Address }[],
	{ from, to }: { from: Address; to: Address },
): { args: TransferEventArgs; address: Address } | undefined => {
	return logs.find(
		(log) => getAddress(log.args.from) === getAddress(from) && getAddress(log.args.to) === getAddress(to),
	);
};

export default async function transactionsRoutes(fastify: FastifyInstance) {
	fastify.post<{ Reply: IRecentTransaction; Body: { txId: string | Hash; chain: TChain; chainId: TChainId } }>(
		"/get-transaction",
		async (request) => {
			const { txId, chain, chainId } = request.body;

			const isAllowed = isChainIdAllowedForChain(chain, chainId);

			if (!isAllowed) {
				throw new Error(`This chain pair is not allowed ${chain}:${chainId}`);
			}

			if (chain === "evm") {
				const provider = new EVMRpcProvider(chainId);
				const rpc = provider.client;
				let receiptError = false;
				const receipt = await rpc.getTransactionReceipt({ hash: txId as Hash }).catch(() => {
					receiptError = true;
				});

				const status = receiptError || !receipt ? "pending" : receipt?.status;

				let returnData: IRecentTransaction = {
					from: receipt?.from ? getAddress(receipt.from) : undefined,
					status,
					txId,
					chain,
					chainId,
				};

				let swapLog = undefined;

				if (receipt?.logs) {
					for (const abiKey of Object.keys(ABIS)) {
						const abi = ABIS?.[abiKey as TSupportProtocol];
						if (!abi) continue;

						const parsedLogs = parseEventLogs({
							abi,
							logs: receipt?.logs || [],
							eventName: "Swap",
						});

						if (parsedLogs?.length > 0) {
							swapLog = { ...parsedLogs[0], abi: abiKey as TSupportProtocol };
							break;
						}
					}

					if (!swapLog || !swapLog?.address) {
						return returnData;
					}

					const transferLogs = parseEventLogs({
						abi: erc20Abi,
						logs: receipt.logs,
						eventName: "Transfer",
					});

					const pairAddress = getAddress(swapLog.address);

					let inputTransfer = null;
					let outputTransfer = null;

					if (swapLog.abi === "uniswapv2") {
						const { sender, to } = swapLog.args as { sender: Address; to: Address };

						inputTransfer = findTransfer(transferLogs, {
							from: sender,
							to: pairAddress,
						});

						outputTransfer = findTransfer(transferLogs, {
							from: pairAddress,
							to: to,
						});
					} else if (swapLog.abi === "uniswapv3") {
						const { sender, recipient } = swapLog.args as { sender: Address; recipient: Address };

						inputTransfer = findTransfer(transferLogs, {
							from: sender,
							to: pairAddress,
						});

						outputTransfer = findTransfer(transferLogs, {
							from: pairAddress,
							to: recipient,
						});
					} else if (swapLog.abi === "uniswapv4") {
						return returnData;
					}

					if (inputTransfer && outputTransfer) {
						const [inputTransferDecimals, inputTransferSymbol, outputTransferDecimals, outputTransferSymbol] =
							await provider.readMultipleErc20Multicall(
								[inputTransfer.address, inputTransfer.address, outputTransfer.address, outputTransfer.address],
								["decimals", "symbol", "decimals", "symbol"],
								[undefined, undefined, undefined, undefined],
							);

						if (!inputTransferDecimals || !outputTransferDecimals) return returnData;

						const result = {
							protocol: swapLog.abi,
							input: {
								tokenAddress: getAddress(inputTransfer.address),
								amount: inputTransfer.args.value.toString(),
								symbol: String(inputTransferSymbol),
								decimals: Number(inputTransferDecimals),
								amountFormatted: String(formatUnits(BigInt(inputTransfer.args.value), Number(inputTransferDecimals))),
							},
							output: {
								tokenAddress: getAddress(outputTransfer.address),
								amount: outputTransfer.args.value.toString(),
								symbol: String(outputTransferSymbol),
								decimals: Number(outputTransferDecimals),
								amountFormatted: String(formatUnits(BigInt(outputTransfer.args.value), Number(outputTransferDecimals))),
							},
						};

						returnData = {
							...returnData,
							...result,
						};
					}
				}

				/** If for some reason we cant read out the swap, we should at least tell the user whether the transaction was a success */
				return returnData;
			}

			if (chain === "solana") {
				const returnData: IRecentTransaction = {
					chain,
					chainId,
					txId,
					from: "0xABCDEFGH",
					status: "pending",
				};
				return returnData;
			}

			throw new Error("Unsupported chain or chainId passed");
		},
	);

	fastify.post<{
		Body: {
			tokenMint: string;
			chain: TChain;
			chainId: TChainId;
		};
		Reply: {
			success: boolean;
			signature?: string;
			error?: string;
		};
	}>("/claim", async (request, reply) => {
		try {
			const user = request.authUser;
			if (!user?.solana && !user?.evm) {
				return reply.code(401).send({ success: false, error: "Authentication required" });
			}

			const { tokenMint, chain, chainId } = request.body;
			if (!tokenMint) {
				console.error("Token mint is required for claiming fees");
				return reply.code(400).send({ success: false, error: "Token mint is required" });
			}

			if (!chain || chainId === undefined) {
				return reply.code(400).send({ success: false, error: "Token chain and chainId are required" });
			}

			const context = await getTokenRuntimeContext(
				{
					mint: tokenMint,
					chain,
					chainId,
				},
				user,
			);

			if (!context) {
				console.error("Token not found for claiming fees", tokenMint, chain, chainId);
				return reply.code(404).send({ success: false, error: "Token not found" });
			}

			if (!context.matchedWallet) {
				console.error("User is not the owner of the tokenMint", tokenMint, chain, chainId, user);
				return reply.code(403).send({ success: false, error: "You are not the owner of this token" });
			}

			if (context.token.chain !== "solana") {
				console.error("Claiming is only supported for Solana tokens");
				return reply.code(400).send({ success: false, error: "Claiming is only supported for Solana tokens" });
			}

			const migration = await DB.Migration.findOne({
				contractAddress: tokenMint,
				chain,
				chainId,
			}).lean();
			if (!migration) {
				console.error("Token has not been migrated yet");
				return reply.code(400).send({ success: false, error: "Token has not been migrated yet" });
			}

			const claimer = new Claimer(context.token.chainId as SolanaNetworkIds);
			let signature: string;

			if (context.token.pool === "meteora") {
				console.log("Claiming fees from Meteora pool");
				signature = await claimer.claimMeteora(tokenMint);
			} else if (context.token.pool === "raydium") {
				console.log("Claiming fees from Raydium pool");
				signature = await claimer.claimRaydium(tokenMint);
			} else {
				return reply.code(400).send({ success: false, error: "Unsupported protocol for claiming" });
			}

			const claimedAt = new Date();
			try {
				await Promise.all([
					DB.Token.updateOne(
						{ contractAddress: tokenMint, chain, chainId },
						{ $set: { lastClaimedAt: claimedAt } },
					),
					upsertRuntimeRecord({
						mint: tokenMint,
						chain,
						chainId,
						lastClaimedAt: claimedAt,
					}),
				]);
			} catch (syncError) {
				console.warn("Claim succeeded on-chain but post-claim state sync failed:", syncError);
			}

			return reply.send({ success: true, signature });
		} catch (error) {
			console.error("Error claiming fees:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Failed to claim fees",
			});
		}
	});
}
