"use client";

import type { IToken } from "@waifufun/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { abbreviateNumber, fromNow, shortenAddress } from "@/lib/utils";
import { formatUnits } from "viem";
import Progressbar from "./progressbar";
import { Fragment } from "react";
import Image from "next/image";
import Verified from "./verified";
import { CopyButton } from "./copy-button";
import { useRouter } from "@bprogress/next/app";

export default function ListView({ tokens }: { tokens: IToken[] }) {
	const router = useRouter();

	const navigateClick = (token: IToken) => {
		router.push(`/token/${token.chain}/${token.chainId}/${token.contractAddress}`);
	};

	return (
		<Table className="border-separate border-spacing-y-1">
			<TableHeader>
				<TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
					<TableHead className="lg:w-0 text-[#52525b] font-medium">Coin</TableHead>
					<TableHead className="text-center text-[#52525b] font-medium">Mcap</TableHead>
					<TableHead className="text-center text-[#52525b] font-medium">24h Volume</TableHead>
					<TableHead className="text-center text-[#52525b] font-medium">Holders</TableHead>
					<TableHead className="text-center text-[#52525b] font-medium">Tokens</TableHead>
					<TableHead className="text-left text-[#52525b] font-medium">Bonding</TableHead>
					<TableHead className="w-12 text-left text-[#52525b] font-medium">Age</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{tokens.map((token: IToken) => {
					const isVerified = Boolean(token?.verified);
					const rowBg = isVerified
						? "bg-green-900/50 hover:bg-green-800/60 border-green-500/20"
						: "bg-[#111114] hover:bg-[#18181c] border-[rgba(255,255,255,0.06)]";
					return (
					<TableRow 
						className={`group cursor-pointer border-b transition-colors ${rowBg}`}
						key={token.contractAddress} 
						onClick={() => navigateClick(token)}
					>
						<TableCell className="text-[#71717a] font-medium rounded-l-lg">
							<div className="flex items-center gap-3">
								{/* Image */}
								<Image
									src={token.image}
									width={60}
									height={60}
									unoptimized
									alt="token_image"
									className="size-[60px] rounded-sm aspect-square"
								/>
								{/* Token Name */}
								<div className="flex flex-col gap-2.5">
									{/* Name */}
									<div className="flex items-center gap-1.5">
										<span className="text-[#e4e4e7] text-xl font-medium font-satoshi uppercase">{token.name}</span>
										<span className="text-lg font-medium uppercase text-[#71717a] truncate">
											{token.ticker}
										</span>
										<Verified isVerified={token?.verified} />
									</div>
									<div className="flex items-center gap-2">
										<CopyButton textToCopy={token.contractAddress} />
										<span className="text-[#52525b] text-base font-medium font-['Satoshi'] leading-snug">
											{shortenAddress(token.contractAddress)}
										</span>
									</div>
								</div>
							</div>
						</TableCell>
						<TableCell className="text-center">
							<span className="text-[#00ff87] text-base font-medium font-satoshi leading-none">
								{abbreviateNumber(token.marketcap)}
							</span>
						</TableCell>
						<TableCell className="text-center text-[#e4e4e7]">{abbreviateNumber(token.volume24h)}</TableCell>
						<TableCell className="text-center text-[#e4e4e7]">{abbreviateNumber(token.holders, true)}</TableCell>
						<TableCell className="text-center text-[#e4e4e7]">
							{abbreviateNumber(Number(formatUnits(BigInt(token.totalSupply), token.decimals)), true)}
						</TableCell>
						<TableCell className="text-left">
							{token.imported ? (
								<span className="text-[#00ff87] text-sm font-medium font-satoshi uppercase leading-none tracking-widest">
									Import
								</span>
							) : (
								<Fragment>
									{typeof token?.curveProgress === "number" && !token?.curveCompleted ? (
										<div className="flex flex-col gap-2.5 max-w-[275px]">
											<div className="text-[#e4e4e7] text-base font-medium font-satoshi leading-none inline-flex gap-2">
												Progress
												<span className="text-[#00ff87] font-normal">
													{token.curveProgress.toFixed(2)}%
												</span>
											</div>
											<Progressbar max={100} height="h-2.5" value={Number(token.curveProgress.toFixed(2))} />
										</div>
									) : null}
								</Fragment>
							)}
						</TableCell>
						<TableCell className="text-right text-[#71717a] rounded-r-lg">{token?.createdAt ? fromNow(token?.createdAt, true) : "-"}</TableCell>
					</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
