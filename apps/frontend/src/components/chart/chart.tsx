import LocalChart from "./local-chart";
import { getCoinGeckoChainName } from "../../lib/utils";
import type { IToken } from "@autofun/types";

interface ChartProps {
	token: IToken;
}

export default function Chart({ token }: ChartProps) {
	const isMigrated = token?.status === "migrated" || token?.status === "locked" || token?.status === "finalized";
	const curveCompleted = (token?.curveCompleted && isMigrated) || token?.imported;

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
		);
	}
	return <LocalChart token={token} />;
}
