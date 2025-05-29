import type { TokenMetadata } from "../hooks/providers/usePromptContext";

export abstract class WalletClass {
	// biome-ignore lint/suspicious/noExplicitAny: need for flexibility in inheritance
	abstract sendTransaction(transaction: any): Promise<any>;

	abstract signMessage(message: string): Promise<string>;

	abstract getNativeBalance(): Promise<number>;

	// biome-ignore lint/suspicious/noExplicitAny: use any
	abstract createToken(tokenMetadata: TokenMetadata): Promise<any>;
}
