export abstract class WalletClass {
	abstract sendTransaction(transaction: any): Promise<any>;

	abstract signMessage(message: string): Promise<string>;

	abstract getNativeBalance(): Promise<number>;
}
