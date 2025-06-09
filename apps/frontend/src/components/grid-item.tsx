import { abbreviateNumber, fromNow } from "@/lib/utils";
import type { IToken } from "@autofun/types";
import Image from "next/image";
import Link from "next/link";
import Verified from "./verified";

export const GridItem = ({ token }: { token: IToken }) => {
	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className="bg-autofun-background-card group rounded-sm overflow-hidden"
		>
			<div className="flex flex-col min-w-0 relative">
				<div className="absolute top-0 left-0 p-2 px-3 z-10 group-hover:opacity-100 opacity-0 transition-opacity duration-200">
					{/* <TokenStatus token={token} /> */}
				</div>
				{/* <div className="absolute top-0 left-0 p-2 px-3 z-10">
					<ChainIndicator chain={token.chain} chainId={token.chainId} />
				</div> */}
				<div className="absolute left-0 bottom-0 p-2 px-3 w-full z-10">
					<div className="flex items-center gap-4 justify-between">
						<div className="flex items-center gap-2 w-full min-w-0">
							<div className="bg-autofun-background-muted/65 px-1.5 text-autofun-text-primary text-lg font-medium rounded-sm uppercase leading-normal tracking-widest truncate min-w-0 drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
								${token.ticker}
							</div>
							<Verified isVerified={token?.verified} />
						</div>
						{token?.createdAt ? (
							<div className="px-1.5 bg-autofun-background-muted/65 rounded-sm text-autofun-text-primary text-sm shrink-0 font-medium  drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
								{fromNow(token?.createdAt, true)}
							</div>
						) : null}
					</div>
				</div>
				<div className="flex flex-col w-full min-w-0 z-10">
					<div className="absolute flex flex-col top-0 right-0 p-2 px-3 items-end min-w-0 gap-2">
						<div className="bg-autofun-background-muted/65 px-1.5 text-autofun-text-highlight text-base font-medium leading-7 rounded-sm truncate drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
							MC {abbreviateNumber(token.marketcap)}
						</div>
						<div className="bg-autofun-background-muted/65 px-1.5 text-autofun-text-primary text-base font-medium leading-7 rounded-sm truncate drop-shadow-[0_0px_2px_rgba(0,0,0,0.4)] z-[2]">
							Vol {abbreviateNumber(token.volume24h)}
						</div>
					</div>
				</div>

				<div className="w-full h-full aspect-square relative">
					<div className="absolute top-0 rotate-180 aspect-square size-full bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8)_0%,transparent_20%,transparent_80%,rgba(0,0,0,0.5)_100%)] z-1" />
					<Image
						src={token.image}
						width={500}
						height={500}
						unoptimized
						alt="image"
						className="w-full h-full object-cover aspect-square z-[-1] group-hover:scale-105 transition-all duration-200"
					/>
				</div>
			</div>
		</Link>
	);
};
