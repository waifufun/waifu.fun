import ChainSelector from "@/components/chain-selector";
import { GridItem } from "@/components/grid-item";
import { Button } from "@/components/ui/button";
import { getTokens } from "@/lib/api";
import type { IToken } from "@autofun/types";
import { Grid, List } from "lucide-react";
import Image from "next/image";

export default async function Home({ searchParams }) {
	const data = await getTokens({ searchParams: await searchParams });
	const tokens = data?.docs;

	return (
		<div className="flex flex-col gap-4">
			<Image
				src="/homepage-hero.svg"
				width={1816}
				height={52}
				unoptimized
				priority
				alt="hero"
				className="mx-auto w-full select-none"
			/>
			<ChainSelector />
			<div className="ml-auto flex items-center gap-2">
				<Button variant="secondary" size="icon">
					<List />
				</Button>
				<Button variant="outline" size="icon">
					<Grid />
				</Button>
			</div>
			<div className="grid grid-cols-6 gap-4">
				{tokens?.map((token: IToken) => (
					<GridItem token={token} key={token.contractAddress} />
				))}
			</div>
			{/* <RecentTransactions /> */}
		</div>
	);
}
