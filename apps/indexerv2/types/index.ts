import { LaunchData, SwapData, CurveCompleteData } from './events';

export type EventData = 
  | { event: 'launch'; data: LaunchData }
  | { event: 'swap'; data: SwapData }
  | { event: 'curveComplete'; data: CurveCompleteData };

export interface RpcRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any[];
}

export interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}