import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@autofun/types";
import Image from "next/image";

export default async function Page({ params }: { params: ITokenLookUp }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);

	return (
		<div className="flex flex-col gap-3">
			<div className="w-full py-10 flex flex-wrap justify-between">
				<div className="flex-1 flex flex-col items-center">
					<span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
						{token?.marketcap}
					</span>
					<span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">Market Cap</span>
				</div>
				<div className="flex-1 flex flex-col items-center">
					<span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
						{token?.volume24h}
					</span>
					<span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">24hr Volume</span>
				</div>
				<div className="flex-1 flex flex-col items-center">
					<span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
						{String(token?.createdAt)}
					</span>
					<span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">Age</span>
				</div>
			</div>
			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-4">
				<div className="w-full lg:w-1/4 flex flex-col gap-3 order-1 lg:order-1">
					<div className="flex flex-col gap-3">
						<div>
							<Image src={token.image} width={500} height={500} unoptimized alt={token.name} />
						</div>
						{/* Description */}
						{/* <div>{token?.description}</div> */}
						{/* Contractaddress */}
						<div>{token?.contractAddress}</div>
						{/* Socials */}
						<div className="flex flex-col gap-4">
							{token?.socials?.twitter}
							{token?.socials?.website}
							{token?.socials?.telegram}
							{token?.socials?.discord}
						</div>
					</div>
					{JSON.stringify(token)}
				</div>
				<div className="w-full lg:w-1/2 flex flex-col gap-3 order-3 lg:order-2">
					<iframe
						height="100%"
						width="100%"
						src="https://dexcheck.ai/app/solana/chart/FCe2fD8WW65oFaL9yvogJtekCfPcDJFsKg31egNZPa79&embed=true"
						title="chart"
					/>
				</div>
				<div className="w-full lg:w-1/4 flex flex-col md:flex-row lg:flex-col gap-3 order-2 lg:order-3">hi</div>
			</div>
		</div>
	);
}
