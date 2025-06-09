import { isCurveCompleted } from "../../lib/api";
import LocalChart from "./local-chart";
import {getCoinGeckoChainName} from "../../lib/utils";
import type { IToken, ITokenLookUp } from "@autofun/types";
import { useEffect, useState } from "react";

interface ChartProps {
    token: IToken;
    tokenLookUp: ITokenLookUp;
}

export default function Chart({ token, tokenLookUp }: ChartProps) {
    const [curveCompleted, setCurveCompleted] = useState<boolean | null>(null);

    useEffect(() => {
        const checkIfCurveCompleted = async () => {
            const result = await isCurveCompleted(tokenLookUp);
            setCurveCompleted(result.curveCompleted);
        }

        checkIfCurveCompleted();
    }, []);

    if (curveCompleted === null) {
        return <div className="flex items-center justify-center h-full">Loading...</div>;
    }

    if (curveCompleted) {
        return (
            <iframe
                height="100%"
                width="100%"
                className="min-h-[580px] h-full mb-[-41px]"
                id="geckoterminal-embed"
                title="GeckoTerminal Embed"
                src={`https://www.geckoterminal.com/${getCoinGeckoChainName(token.chain, token.chainId)}/pools/${token.contractAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
                allow="clipboard-write"
                allowFullScreen
            />
        )
    } else {
        return <LocalChart token={token} />;
    }
}