import { PublicKey } from "@solana/web3.js";
import logger from "@waifufun/logger";

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class SolanaEventDecoder {
	private static arraysEqual(a: number[], b: number[]): boolean {
		return a.length === b.length && a.every((val, i) => val === b[i]);
	}
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	static decodeCompleteEvent(eventData: Buffer, debugStatements = false): any {
		try {
			const discriminator = Array.from(eventData.slice(0, 8));
			const expectedDiscriminator = [95, 114, 97, 156, 212, 46, 152, 8];

			// biome-ignore lint/complexity/noThisInStatic: <explanation>
			if (!this.arraysEqual(discriminator, expectedDiscriminator)) {
				return null;
			}

			const userBytes = eventData.slice(8, 40);
			const mintBytes = eventData.slice(40, 72);
			const bondingCurveBytes = eventData.slice(72, 104);

			const user = new PublicKey(userBytes).toBase58();
			const mint = new PublicKey(mintBytes).toBase58();
			const bondingCurve = new PublicKey(bondingCurveBytes).toBase58();

			return { user, mint, bondingCurve };
		} catch (error) {
			if (debugStatements) {
				logger.error("Error decoding complete event:", error);
			}
			return null;
		}
	}
}
