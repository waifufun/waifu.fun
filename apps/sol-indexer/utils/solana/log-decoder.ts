// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class SolanaLogDecoder {
	static decodeSwapLog(logs: string[], _debugStatements = false): { buyWith: string; sellWith: string } | null {
		const data = {
			buyWith: "0",
			sellWith: "0",
		};

		for (const log of logs) {
			const swapEventMatch = log.match(/Program log: SwapEvent: \S+ \d+ (\d+)/);
			if (swapEventMatch?.[1]) {
				data.sellWith = swapEventMatch[1];
			}

			const swapMatch = log.match(/Program log: Swap: \S+ \d+ (\d+)/);
			if (swapMatch?.[1]) {
				data.buyWith = swapMatch[1];
			}
		}

		if (data.buyWith !== "0" || data.sellWith !== "0") {
			return data;
		}
		throw new Error(
			`Decoded Swap Log: BuyWith=${data.buyWith}, SellWith=${data.sellWith} for logs: ${JSON.stringify(logs)}`,
		);
	}
}
