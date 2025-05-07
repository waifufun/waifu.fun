import ChainSelector from "@/components/chain-selector";
import { getTokens } from "@/lib/api";
import type { IToken } from "@autofun/types";
import Image from "next/image";
import Link from "next/link";

export default async function Home({ searchParams }) {
	const data = await getTokens({ searchParams });

	const tokens = data?.docs;

	return (
		<div className="flex flex-col gap-4">
			<ChainSelector />
			<div className="grid grid-cols-6 gap-4">
				{tokens?.map((token: IToken) => (
					<Link
						href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
						key={token.contractAddress}
						className="flex flex-col gap-1 overflow-hidden aspect-square relative border rounded-md"
					>
						<Image
							src={token?.image}
							width={500}
							height={500}
							unoptimized
							alt={token.name}
							className="absolute top-0 left-0"
						/>
						<div className="flex justify-between gap-4 z-20 absolute bottom-0 left-0 p-4 w-full font-bold bg-black/90">
							<div>
								{token.name} ({token.chain}:{token.chainId})
							</div>
							<div>
								MC: {token.marketcap} Vol:{token.volume24h}
							</div>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
