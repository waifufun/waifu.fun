import type {IToken, ITokenLookUp} from "@autofun/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { twMerge } from "tailwind-merge";
import { isCurveCompleted } from "@/lib/api";
import LocalChart from "./local-chart";
import { getCoinGeckoChainName } from "@/lib/utils";

interface ChartProps {
    token: IToken;
    tokenLookUp: ITokenLookUp;
}
export default async function Chart({ params }: { params: Promise<ChartProps> }) {
    const chart = await params;
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const candlestickSeriesRef = useRef<any>(null);
    const chartRef = useRef<any>(null);
    const curveCompleted = await isCurveCompleted(chart.tokenLookUp);

    const mint = chart.token.contractAddress;

    const useCoingecko = curveCompleted.curveCompleted;

    if (useCoingecko) {
        return (
            <iframe
                height="100%"
                width="100%"
                className="min-h-[580px] h-full mb-[-41px]"
                id="geckoterminal-embed"
                title="GeckoTerminal Embed"
                src={`https://www.geckoterminal.com/${getCoinGeckoChainName(chart.token.chain, chart.token.chainId)}/pools/${chart.token.contractAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
                allow="clipboard-write"
                allowFullScreen
            />
        )
    } else {
        return <LocalChart token={chart.token} />;
    }
}
