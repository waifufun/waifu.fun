export type TokenMetadata = {
	name: string;
	symbol: string;
	description: string;
	image: string;
	/** Salt for CREATE2 address derivation on BSC */
	launchSalt: string;
	buyAmount: number;
	metadataUrl: string;
	curveLimit: number;
	delayForTrade: number;
	tradeLimitSol: number;
};
