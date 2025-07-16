import type { DecodedInstruction } from "../../../types";

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export abstract class SolanaInstructionDecoder {
	protected arraysEqual(a: number[], b: number[]): boolean {
		return a.length === b.length && a.every((val, i) => val === b[i]);
	}

	public abstract decodeAutofunInstruction(instructionData: Buffer, accounts: string[]): DecodedInstruction;
}
