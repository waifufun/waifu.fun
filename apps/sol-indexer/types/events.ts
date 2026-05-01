export interface EventData {
	event: "launch" | "swap" | "curveComplete" | "withdraw";
	signature: string;
	data: LaunchData | SwapData | CurveCompleteData | WithdrawData;
	blockHeight: number;
	from: string;
	timestamp: number;
}

export interface LaunchData {
	name: string;
	symbol: string;
	uri: string;
	decimals: number;
	mintAddress: string;
}

export interface SwapData {
	amount: number;
	direction: "buy" | "sell";
	minimumReceiveAmount: number;
	wantedAmount: number;
	receivedAmount: number;
	tokenMint: string;
}

export interface CurveCompleteData {
	user: string;
	mint: string;
	bondingCurve: string;
}

export interface WithdrawData {
	admin: string;
	tokenMint: string;
	bondingCurve: string;
	globalVault?: string;
}

export interface WithdrawEvent {
	eventType: "withdraw";
	data: WithdrawData;
}
