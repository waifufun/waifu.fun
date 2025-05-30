export interface EventData {
  event: 'launch' | 'swap' | 'curveComplete';
  signature: string;
  data: LaunchData | SwapData | CurveCompleteData;
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
  direction: 'buy' | 'sell';
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