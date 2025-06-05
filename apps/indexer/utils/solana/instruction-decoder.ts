import { instructions as IDLInstructions } from "../../abi/autofun";
import type { DecodedInstruction } from "../../types";

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class SolanaInstructionDecoder {
	private static arraysEqual(a: number[], b: number[]): boolean {
		return a.length === b.length && a.every((val, i) => val === b[i]);
	}

	static decodeAutofunInstruction(instructionData: Buffer, accounts: string[]): DecodedInstruction {
		const discriminator = Array.from(instructionData.slice(0, 8));
		// biome-ignore lint/complexity/noThisInStatic: <explanation>
		if (this.arraysEqual(discriminator, IDLInstructions.launch.d8)) {
			return {
				type: "launch",
				data: IDLInstructions.launch.decode(instructionData),
				mintAddress: accounts[3],
				creator: accounts[2],
				accounts,
			};
		}

		// biome-ignore lint/complexity/noThisInStatic: <explanation>
		if (this.arraysEqual(discriminator, IDLInstructions.swap.d8)) {
			return {
				type: "swap",
				data: IDLInstructions.swap.decode(instructionData),
				tokenMint: accounts[5],
				user: accounts[8],
				accounts,
			};
		}
		// biome-ignore lint/complexity/noThisInStatic: <explanation>
		if (this.arraysEqual(discriminator, IDLInstructions.launchAndSwap.d8)) {
			return {
				type: "launchAndSwap",
				data: IDLInstructions.launchAndSwap.decode(instructionData),
				mintAddress: accounts[3],
				creator: accounts[2],
				accounts,
			};
		}

		return { type: "unknown", discriminator, accounts };
	}
}
