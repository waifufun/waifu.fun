import type { DecodedInstruction } from "../../../types";

export abstract class SolanaInstructionDecoder {
	protected arraysEqual(a: number[], b: number[]): boolean {
		return a.length === b.length && a.every((val, i) => val === b[i]);
	}

	public abstract decodeAutofunInstruction(instructionData: Buffer, accounts: string[]): DecodedInstruction;
}
