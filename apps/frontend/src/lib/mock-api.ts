import mockTokens from "@/data/mock-tokens.json";
import type { IToken } from "@waifufun/types";

export function getMockToken(contractAddress: string): IToken | null {
	const token = (mockTokens as IToken[]).find((t) => t.contractAddress === contractAddress);
	return token || null;
}
