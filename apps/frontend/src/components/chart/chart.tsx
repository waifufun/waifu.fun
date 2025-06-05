import { isCurveCompleted } from "../../lib/api";
import LocalChart from "./local-chart";
import {getCoinGeckoChainName} from "../../lib/utils";
import type { IToken, ITokenLookUp } from "@autofun/types";

interface ChartProps {
    token: IToken;
    tokenLookUp: ITokenLookUp;
}

export default async function Chart({ token, tokenLookUp }: ChartProps) {
    const curveCompleted = await isCurveCompleted(tokenLookUp);
    const useCoingecko = curveCompleted.curveCompleted;

    if (useCoingecko) {
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