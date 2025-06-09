import { PublicKey } from "@solana/web3.js";
import logger from "@autofun/logger";

export class SolanaLogDecoder {
  static decodeSwapLog(
    logs: string[],
    debugStatements: boolean = false
  ): { buyWith: string; sellWith: string } | null {
        let data = {
            buyWith: "0",
            sellWith: "0",
        }

        for (const log of logs) {
            const swapEventMatch = log.match(/Program log: SwapEvent: \S+ \d+ (\d+)/);
            if (swapEventMatch) {
                data.sellWith = swapEventMatch[1];
            }

            const swapMatch = log.match(/Program log: Swap: \S+ \d+ (\d+)/);
            if (swapMatch) {
                data.buyWith = swapMatch[1];
            }
        }

        if (data.buyWith !== "0" || data.sellWith !== "0") {
            return data;
        } else {
            throw new Error(`Decoded Swap Log: BuyWith=${data.buyWith}, SellWith=${data.sellWith} for logs: ${JSON.stringify(logs)}`);
        }

        return null;
    } 
}