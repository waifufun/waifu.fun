"use client";

import type { ChartTimeframe } from "@/lib/api";
import type { IToken } from "@waifufun/types";
import LocalChart from "./local-chart";

interface ChartProps {
	token: IToken;
	timeframe?: ChartTimeframe;
}

export default function Chart({ token, timeframe = "1d" }: ChartProps) {
	return <LocalChart token={token} timeframe={timeframe} />;
}
