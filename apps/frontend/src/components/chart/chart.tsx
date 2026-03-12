import LocalChart from "./local-chart";
import { getCoinGeckoChainName } from "../../lib/utils";
import type { IToken } from "@waifufun/types";

interface ChartProps {
	token: IToken;
}

export default function Chart({ token }: ChartProps) {
	const tokenWithPool = token as IToken & { pool?: string };
	const isMigrated = token?.status === "migrated" || token?.status === "locked" || token?.status === "finalized";
	const curveCompleted = (token?.curveCompleted && isMigrated) || token?.imported;
	const geckoChainName =
		token.chain === "evm" && Number(token.chainId) === 56
			? "bsc"
			: getCoinGeckoChainName(token.chain, token.chainId);
	const geckoPoolAddress = tokenWithPool?.pool;
	const canRenderGeckoTerminal = Boolean(curveCompleted && geckoChainName && geckoPoolAddress);

	if (canRenderGeckoTerminal) {
		return (
			<iframe
				height="100%"
				width="100%"
				className="min-h-[240px] sm:min-h-[320px] md:min-h-[420px] lg:min-h-[580px] w-full h-full mb-[-41px] rounded-sm"
				id="geckoterminal-embed"
				title="GeckoTerminal Embed"
				src={`https://www.geckoterminal.com/${geckoChainName}/pools/${geckoPoolAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
				allow="clipboard-write"
				allowFullScreen
			/>
		);
	}

	return <LocalChart token={token} />;
}
