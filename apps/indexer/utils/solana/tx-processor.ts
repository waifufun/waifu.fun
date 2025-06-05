import logger from "@autofun/logger";
import type { DecodedInstruction } from "../../types";
import { SolanaInstructionDecoder } from "./instruction-decoder";
import { SolanaEventDecoder } from "./event-decoder";
import { SolanaAmountExtractor } from "./extract-amount";

export class SolanaTransactionProcessor {
	constructor(
		private autoFunAddress: string,
		private debugStatements = false,
	) {}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	hasAutoFunProgram(accounts: any[]): boolean {
		return accounts.some((account) => account.toBase58() === this.autoFunAddress);
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

			const decodedInstruction = SolanaInstructionDecoder.decodeAutofunInstruction(
				Buffer.from(instruction.data),
				instructionAccounts,
			);

			if (decodedInstruction.type !== "unknown") {
				const eventData = this.createEventData(
					signatures[0],
					slot,
					blockTime,
					instructionIndex,
					decodedInstruction,
					transaction,
				);
				events.push(eventData);
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
							processed: true,
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
					swapAmount: instructionData.amount?.toString(),
					direction: direction,
					minimumReceiveAmount: instructionData.minimumReceiveAmount?.toString(),
					deadline: instructionData.deadline?.toString(),
					...amountGotten,
				};
			}

			case "launchAndSwap": {
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const tokenMint = decodedInstruction.mintAddress!;
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const userAddress = decodedInstruction.creator!;

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
					swapAmount: instructionData.swapAmount?.toString(),
					minimumReceiveAmount: instructionData.minimumReceiveAmount?.toString(),
					deadline: instructionData.deadline?.toString(),
					...amountGotten,
				};
			}

			default:
				return baseEventData;
		}
	}
}
