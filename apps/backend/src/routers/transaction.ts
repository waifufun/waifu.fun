import type { FastifyInstance } from "fastify";
import { ABIS } from "@autofun/constants";
import { EVMRpcProvider } from "@autofun/rpc";
import { EvmChainIds } from "@autofun/types";
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

		if (chain !== "evm") {
			return { status: "Unsupported chain" };
		}

		const provider = new EVMRpcProvider(EvmChainIds.BaseMainnet);
		const rpc = provider.client;
		const receipt = await rpc.getTransactionReceipt({ hash: txId });

		let swapLog = undefined;

		for (const abiKey of Object.keys(ABIS)) {
			const abi = ABIS?.[abiKey];
			if (!abi) continue;

			const parsedLogs = parseEventLogs({
				abi,
				logs: receipt.logs,
				eventName: "Swap",
			});

			if (parsedLogs?.length > 0) {
				swapLog = { ...parsedLogs[0], abi: abiKey };
				break;
			}
		}

		if (!swapLog || !swapLog?.address) {
			return { status: "No Swap event found", receipt };
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
			return { status: "Uniswap V4 not implemented yet" };
		}

		if (inputTransfer && outputTransfer) {
			const [inputTransferDecimals, inputTransferSymbol, outputTransferDecimals, outputTransferSymbol] =
				await provider.readMultipleErc20Multicall(
					[inputTransfer.address, inputTransfer.address, outputTransfer.address, outputTransfer.address],
					["decimals", "symbol", "decimals", "symbol"],
					[undefined, undefined, undefined, undefined],
				);

			if (!inputTransferDecimals || !outputTransferDecimals) return {};
			const result = {
				protocol: swapLog.abi,
				input: {
					tokenAddress: inputTransfer.address,
					amount: inputTransfer.args.value.toString(),
					symbol: inputTransferSymbol,
					decimals: inputTransferDecimals,
					amountFormatted: String(formatUnits(inputTransfer.args.value.toString(), Number(inputTransferDecimals))),
				},
				output: {
					tokenAddress: outputTransfer.address,
					amount: outputTransfer.args.value.toString(),
					symbol: outputTransferSymbol,
					decimals: outputTransferDecimals,
					amountFormatted: String(formatUnits(outputTransfer.args.value.toString(), Number(outputTransferDecimals))),
				},
			};

			return { status: "OK", result };
		}

		return {
			status: "Swap log found but could not match transfer events",
			swapLog,
			transfers: transferLogs,
		};
	});
}
