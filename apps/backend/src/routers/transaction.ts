import type { FastifyInstance } from "fastify";
import { ABIS } from "@autofun/constants";
import { EVMRpcProvider } from "@autofun/rpc";
import { EvmChainIds, type IRecentTransaction, type TSupportProtocol } from "@autofun/types";
import { isChainIdAllowedForChain } from "@autofun/utils";
import { parseEventLogs, erc20Abi, getAddress, type Address, formatUnits } from "viem";

function findTransfer(logs, { from, to }: { from: string; to: string }) {
	return logs.find(
		(log) => getAddress(log.args.from) === getAddress(from) && getAddress(log.args.to) === getAddress(to),
	);
}

export default async function transactionsRoutes(fastify: FastifyInstance) {
	fastify.post("/get-transaction", async (request) => {
		const { txId, chain, chainId } = request.body;

		const isAllowed = isChainIdAllowedForChain(chain, chainId);

		if (!isAllowed) {
			throw new Error(`This chain pair is not allowed ${chain}:${chainId}`);
		}

		if (chain === "evm") {
			const provider = new EVMRpcProvider(chainId);
			const rpc = provider.client;
			const receipt = await rpc.getTransactionReceipt({ hash: txId });
			const status = receipt?.status;

			let returnData: IRecentTransaction = {
				from: getAddress(receipt.from),
				status,
				txId,
				chain,
				chainId,
			};

			let swapLog = undefined;

			for (const abiKey of Object.keys(ABIS)) {
				const abi = ABIS?.[abiKey as TSupportProtocol];
				if (!abi) continue;

				const parsedLogs = parseEventLogs({
					abi,
					logs: receipt.logs,
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
						amountFormatted: String(formatUnits(inputTransfer.args.value.toString(), Number(inputTransferDecimals))),
					},
					output: {
						tokenAddress: getAddress(outputTransfer.address),
						amount: outputTransfer.args.value.toString(),
						symbol: String(outputTransferSymbol),
						decimals: Number(outputTransferDecimals),
						amountFormatted: String(formatUnits(outputTransfer.args.value.toString(), Number(outputTransferDecimals))),
					},
				};

				returnData = {
					...returnData,
					...result,
				};
			}

			/** If for some reason we cant read out the swap, we should at least tell the user whether the transaction was a success */
			return returnData;
		}

		throw new Error("Unsupported chain or chainId passed");
	});
}
