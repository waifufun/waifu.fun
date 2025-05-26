import type { IToken } from "@autofun/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { abbreviateNumber, fromNow, shortenAddress } from "@/lib/utils";
import { formatUnits } from "viem";
import Progressbar from "./progressbar";
import { Fragment } from "react";
import Image from "next/image";
import ChainIndicator from "./chain-indicator";
import Verified from "./verified";
import { CopyButton } from "./copy-button";

export default function ListView({ tokens }: { tokens: IToken[] }) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-0">Coin</TableHead>
					<TableHead className="text-center">Mcap</TableHead>
					<TableHead className="text-center">24h Volume</TableHead>
					<TableHead className="text-center">Holders</TableHead>
					<TableHead className="text-center">Tokens</TableHead>
					<TableHead className="text-left">Bonding</TableHead>
					<TableHead className="w-12 text-left">Age</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{tokens.map((token: IToken) => (
					<TableRow key={token.contractAddress} className="group">
						<TableCell className="text-autofun-text-secondary font-medium">
							<div className="flex items-center gap-3">
								{/* Image */}
								<Image
									src={token.image}
									width={60}
									height={60}
									unoptimized
									alt="token_image"
									className="size-[60px] rounded-lg"
								/>
								{/* Token Name */}
								<div className="flex flex-col gap-2.5">
									{/* Name */}
									<div className="flex items-center gap-1.5">
										<ChainIndicator chain={token.chain} chainId={token.chainId} />
										<span className="text-white text-xl font-medium font-satoshi uppercase">{token.name}</span>
										<span className="text-lg font-medium uppercase text-autofun-text-secondary">{token.ticker}</span>
										<Verified isVerified={token?.verified} />
									</div>
									<div className="flex items-center gap-2">
										<CopyButton textToCopy={token.contractAddress} />
										<span className="text-autofun-text-secondary text-base font-medium font-['Satoshi'] leading-snug">
											{shortenAddress(token.contractAddress)}
										</span>
									</div>
								</div>
							</div>
						</TableCell>
						<TableCell className="text-center">
							<span className=" text-autofun-background-action-highlight text-base font-medium font-satoshi leading-none">
								{abbreviateNumber(token.marketcap)}
							</span>
						</TableCell>
						<TableCell className="text-center">{abbreviateNumber(token.volume24h)}</TableCell>
						<TableCell className="text-center">{abbreviateNumber(token.holders, true)}</TableCell>
						<TableCell className="text-center">
							{abbreviateNumber(Number(formatUnits(BigInt(token.totalSupply), token.decimals)), true)}
						</TableCell>
						<TableCell className="text-left">
							{token.imported ? (
								<span className="text-autofun-background-action-highlight text-sm font-medium font-satoshi uppercase leading-none tracking-widest">
									Import
								</span>
							) : (
								<Fragment>
									{token.curveProgress ? (
										<div className="flex flex-col gap-2.5 max-w-[275px]">
											<div className="text-autofun-text-primary text-base font-medium font-satoshi leading-none inline-flex gap-2">
												Progress
												<span className="text-autofun-background-action-highlight font-normal">
													{token.curveProgress.toFixed(2)}%
												</span>
											</div>
											<Progressbar max={100} height="h-2.5" value={Number(token.curveProgress.toFixed(2))} />
										</div>
									) : null}
								</Fragment>
							)}
						</TableCell>
						<TableCell className="text-right">{token?.createdAt ? fromNow(token?.createdAt, true) : "-"}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
