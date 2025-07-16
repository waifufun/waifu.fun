import logger from "@autofun/logger";
import type { DecodedInstruction } from "../../types";
import { SolanaInstructionDecoderV2 } from "./implementations/v2/instruction-decoder-v2";
import type { SolanaInstructionDecoder } from "./abstract/instruction-decoder";
import { SolanaEventDecoder } from "./event-decoder";
import { SolanaAmountExtractor } from "./extract-amount";
import { SolanaLogDecoder } from "./log-decoder";
import DB from "@autofun/database";
import { SolanaRpcProvider } from "@autofun/rpc";
import { SolanaInstructionDecoderLegacy } from "./implementations/legacy/instruction-decoder-legacy";

export class SolanaTransactionProcessor {
	private rpc: SolanaRpcProvider;
	private version: "legacy" | "v2";
	private instructionDecoder: SolanaInstructionDecoder;
	public readonly maxBlock: number;

	constructor(
		private autoFunAddress: string,
		private debugStatements = false,
		version: "legacy" | "v2" = "v2",
		maxBlock: number = Number.POSITIVE_INFINITY,
	) {
		// Initialize RPC provider based on environment
		const networkId = process.env.NETWORK === "mainnet" ? 101 : 103;
		this.rpc = new SolanaRpcProvider(networkId);
		this.version = version;
		if (version === "v2") {
			this.instructionDecoder = new SolanaInstructionDecoderV2();
		} else {
			this.instructionDecoder = new SolanaInstructionDecoderLegacy();
		}
		this.maxBlock = maxBlock;
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	hasAutoFunProgram(accounts: any[]): boolean {
		return accounts.some((account) => account.toBase58() === this.autoFunAddress);
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	private async createTokenFromLaunchEvent(eventData: any, blockTime: number): Promise<void> {
		try {
			const contractAddress = eventData.contractAddress;

			if (!contractAddress) {
				logger.warn("No contract address found in launch event");
				return;
			}

			const existingToken = await DB.Token.findOne({
				contractAddress,
				chain: "solana",
				chainId: eventData.chainId,
			});

			if (existingToken) {
				logger.info(`Token ${contractAddress} already exists, skipping creation`);
				return;
			}

			let image = "";
			let description = "";
			let socials = {};

			if (contractAddress) {
				try {
					const metadata = await this.rpc.getTokenMetadata(contractAddress);
					if (metadata) {
						image = metadata.image || "";
						description = metadata.description || "";
						socials = this.extractSocialsFromMetadata(metadata);
					}
				} catch (error) {
					logger.warn(`Failed to fetch metadata for ${contractAddress}:`, error);
				}
			}

			const tokenData = {
				contractAddress,
				chain: "solana",
				chainId: eventData.chainId,
				name: eventData.tokenName || "Unknown Token",
				ticker: eventData.tokenSymbol || "UNK",
				decimals: eventData.decimals || 9,
				image,
				description,
				socials,
				creator: eventData.creator,
				createdAt: new Date(blockTime * 1000),
				imported: false,
				verified: false,
				featured: false,
				hidden: false,
				status: "active",
				curveCompleted: false,
				curveProgress: 0,
				volume24h: 0,
				holders: 1,
				price: 0,
				marketcap: 0,
				tokenSupply: eventData.tokenSupply || "0",
				virtualLamportReserves: eventData.virtualLamportReserves || "0",
				version: 2,
				pool: "meteora",
			};

			const newToken = await DB.Token.create(tokenData);
			logger.info(`Created token ${contractAddress} from launch event`);
		} catch (error) {
			logger.error("Failed to create token from launch event:", error);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	private extractSocialsFromMetadata(metadata: any): any {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const socials: any = {};

		// Extract social links from RPC metadata response
		if (metadata.website) socials.website = metadata.website;
		if (metadata.twitter) socials.twitter = metadata.twitter;
		if (metadata.telegram) socials.telegram = metadata.telegram;
		if (metadata.discord) socials.discord = metadata.discord;

		return socials;
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	processTransaction(transaction: any, blockTime: number, slot: number): any[] {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const events: any[] = [];

		const transactionData = transaction.transaction || transaction;
		const accounts = transactionData?.message?.staticAccountKeys;
		const signatures = transactionData?.signatures || transaction.signatures;

		if (!accounts || !signatures) {
			if (this.debugStatements) {
				logger.warn("Transaction missing required data structure");
			}
			return events;
		}

		if (!this.hasAutoFunProgram(accounts)) {
			return events;
		}

		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		const accountStrings = accounts.map((key: any) => key.toBase58());
		const compiledInstructions = transactionData?.message?.compiledInstructions;

		if (!compiledInstructions) {
			if (this.debugStatements) {
				logger.warn("Transaction missing compiled instructions");
			}
			return events;
		}

		// Process instructions
		for (const [instructionIndex, instruction] of compiledInstructions.entries()) {
			const programId = accountStrings[instruction.programIdIndex];

			if (programId !== this.autoFunAddress) continue;

			const instructionAccounts = instruction.accountKeyIndexes.map((index: number) => accountStrings[index]);
			const decodedInstruction = this.instructionDecoder.decodeAutofunInstruction(
				Buffer.from(instruction.data),
				instructionAccounts,
			);

			if (decodedInstruction.type !== "unknown") {
				if (
					this.maxBlock &&
					slot > this.maxBlock &&
					(decodedInstruction.type === "launch" || decodedInstruction.type === "launchAndSwap")
				) {
					// we don't want to process launch events beyond maxBlock
					if (this.debugStatements) {
						logger.warn(`Skipping instruction in block ${slot} as it exceeds maxBlock limit`);
					}
					continue;
				}

				const eventData = this.createEventData(
					signatures[0],
					slot,
					blockTime,
					instructionIndex,
					decodedInstruction,
					transaction,
				);

				// check if direction is 0 or 1
				if (
					(decodedInstruction.type === "swap" || decodedInstruction.type === "launchAndSwap") &&
					decodedInstruction.data?.data?.direction !== undefined
				) {
					if (eventData.direction !== 0 && eventData.direction !== 1) {
						// program only checks if direction is 1, any other value is considered a buy
						eventData.direction = 0;
					}
				}

				events.push(eventData);

				// Create token in database for launch events
				if (decodedInstruction.type === "launch" || decodedInstruction.type === "launchAndSwap") {
					this.createTokenFromLaunchEvent(eventData, blockTime).catch((error) => {
						logger.error("Failed to create token from launch event:", error);
					});
				}
			}
		}

		// Process complete events from logs
		const logs = transaction.meta?.logMessages || [];
		for (const [logIndex, log] of logs.entries()) {
			if (log.startsWith("Program data: ")) {
				try {
					const dataString = log.replace("Program data: ", "");
					const eventData = Buffer.from(dataString, "base64");

					const completeEvent = SolanaEventDecoder.decodeCompleteEvent(eventData, this.debugStatements);
					if (completeEvent) {
						const eventObj = {
							signature: signatures[0],
							slot,
							blockTime,
							eventType: "curveCompleted",
							contractAddress: completeEvent.mint,
							user: completeEvent.user,
							bondingCurve: completeEvent.bondingCurve,
							logIndex,
							programId: this.autoFunAddress,
							processed: false,
						};
						events.push(eventObj);

						if (this.debugStatements) {
							logger.info(`Found curve completion event for mint: ${completeEvent.mint}`);
						}
					}
				} catch (error) {
					// Ignore because not all program data logs are events
				}
			}
		}

		return events;
	}

	private createEventData(
		signature: string,
		slot: number,
		blockTime: number,
		instructionIndex: number,
		decodedInstruction: DecodedInstruction,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		transaction?: any,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	): any {
		const baseEventData = {
			signature,
			slot,
			blockTime,
			eventType: decodedInstruction.type,
			contractAddress: decodedInstruction.mintAddress || decodedInstruction.tokenMint,
			creator: decodedInstruction.creator,
			user: decodedInstruction.user,
			instructionIndex,
			programId: this.autoFunAddress,
			accounts: decodedInstruction.accounts,
			processed: true,
			chainId: process.env.NETWORK === "mainnet" ? 101 : 103,
			version: this.version,
		};

		const instructionData = decodedInstruction.data?.data;
		if (!instructionData) return baseEventData;

		switch (decodedInstruction.type) {
			case "launch":
				return {
					...baseEventData,
					tokenName: instructionData.name,
					tokenSymbol: instructionData.symbol,
					tokenUri: instructionData.uri,
					decimals: instructionData.decimals,
					tokenSupply: instructionData.tokenSupply?.toString(),
					virtualLamportReserves: instructionData.virtualLamportReserves?.toString(),
				};

			case "swap": {
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const tokenMint = decodedInstruction.tokenMint!;
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const userAddress = decodedInstruction.user!;
				const direction = instructionData.direction;

				const logs = transaction?.meta?.logMessages || [];

				if (logs.length === 0) {
					if (this.debugStatements) {
						logger.warn(`No logs found for swap instruction in transaction ${signature}`);
					}
					return baseEventData;
				}

				const swapData = SolanaLogDecoder.decodeSwapLog(logs, this.debugStatements);
				if (!swapData) {
					if (this.debugStatements) {
						logger.warn(`No swap data found in logs for transaction ${signature}`);
					}
					return baseEventData;
				}

				let amountGotten = {};
				if (transaction) {
					amountGotten = SolanaAmountExtractor.extractAmountGotten(
						transaction,
						tokenMint,
						userAddress,
						direction,
						this.debugStatements,
					);
				}

				return {
					...baseEventData,
					swapAmount: swapData.buyWith,
					direction: direction,
					minimumReceiveAmount: instructionData.minimumReceiveAmount?.toString(),
					deadline: instructionData.deadline?.toString(),
					amountGotten: swapData.sellWith,
				};
			}

			case "launchAndSwap": {
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const tokenMint = decodedInstruction.mintAddress!;
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const userAddress = decodedInstruction.creator!;

				const swapData = SolanaLogDecoder.decodeSwapLog(transaction?.meta?.logMessages || [], this.debugStatements);

				let amountGotten = {};
				if (transaction) {
					amountGotten = SolanaAmountExtractor.extractAmountGotten(
						transaction,
						tokenMint,
						userAddress,
						0,
						this.debugStatements,
					);
				}

				return {
					...baseEventData,
					tokenName: instructionData.name,
					tokenSymbol: instructionData.symbol,
					tokenUri: instructionData.uri,
					decimals: instructionData.decimals,
					tokenSupply: instructionData.tokenSupply?.toString(),
					virtualLamportReserves: instructionData.virtualLamportReserves?.toString(),
					swapAmount: swapData ? swapData.buyWith : "0",
					minimumReceiveAmount: instructionData.minimumReceiveAmount?.toString(),
					deadline: instructionData.deadline?.toString(),
					amountGotten: swapData ? swapData.sellWith : "0",
				};
			}
			default:
				return baseEventData;
		}
	}
}
