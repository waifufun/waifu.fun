import { instructions as IDLInstructions } from "../../../../abi/solana/v2/autofun";
import type { DecodedInstruction } from "../../../../types";
import { SolanaInstructionDecoder } from "../../abstract/instruction-decoder";

export class SolanaInstructionDecoderV2 extends SolanaInstructionDecoder {
	public decodeAutofunInstruction(instructionData: Buffer, accounts: string[]): DecodedInstruction {
		const discriminator = Array.from(instructionData.slice(0, 8));
		if (this.arraysEqual(discriminator, IDLInstructions.launch.d8)) {
			return {
				type: "launch",
				data: IDLInstructions.launch.decode(instructionData),
				mintAddress: accounts[3],
				creator: accounts[2],
				accounts,
			};
		}

		if (this.arraysEqual(discriminator, IDLInstructions.swap.d8)) {
			return {
				type: "swap",
				data: IDLInstructions.swap.decode(instructionData),
				tokenMint: accounts[5],
				user: accounts[8],
				accounts,
			};
		}
		if (this.arraysEqual(discriminator, IDLInstructions.launchAndSwap.d8)) {
			return {
				type: "launchAndSwap",
				data: IDLInstructions.launchAndSwap.decode(instructionData),
				mintAddress: accounts[3],
				creator: accounts[2],
				accounts,
			};
		}

		if (this.arraysEqual(discriminator, IDLInstructions.withdraw.d8)) {
			return {
				type: "withdraw",
				data: IDLInstructions.withdraw.decode(instructionData),
				tokenMint: accounts[3], // token_mint account
				admin: accounts[2], // admin account (signer)
				bondingCurve: accounts[4], // bonding_curve account
				globalVault: accounts[1], // global_vault account
				accounts,
			};
		}

		return { type: "unknown", discriminator, accounts };
	}
}
