import { instructions as LegacyIDLInstructions } from "../../../../abi/solana/legacy/autofun_legacy";
import type { DecodedInstruction } from "../../../../types";
import { SolanaInstructionDecoder } from "../../abstract/instruction-decoder";

export class SolanaInstructionDecoderLegacy extends SolanaInstructionDecoder {
	public decodeAutofunInstruction(instructionData: Buffer, accounts: string[]): DecodedInstruction {
		const discriminator = Array.from(instructionData.slice(0, 8));

		if (this.arraysEqual(discriminator, LegacyIDLInstructions.launch.d8)) {
			return {
				type: "launch",
				data: LegacyIDLInstructions.launch.decode(instructionData),
				mintAddress: accounts[3], // Assuming same account structure as v2
				creator: accounts[2],
				accounts,
			};
		}

		if (this.arraysEqual(discriminator, LegacyIDLInstructions.swap.d8)) {
			return {
				type: "swap",
				data: LegacyIDLInstructions.swap.decode(instructionData),
				tokenMint: accounts[5], // Assuming same account structure as v2
				user: accounts[8],
				accounts,
			};
		}

		if (this.arraysEqual(discriminator, LegacyIDLInstructions.launchAndSwap.d8)) {
			return {
				type: "launchAndSwap",
				data: LegacyIDLInstructions.launchAndSwap.decode(instructionData),
				mintAddress: accounts[3],
				creator: accounts[2],
				accounts,
			};
		}

		if (this.arraysEqual(discriminator, LegacyIDLInstructions.withdraw.d8)) {
			return {
				type: "withdraw",
				data: LegacyIDLInstructions.withdraw.decode(instructionData),
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
