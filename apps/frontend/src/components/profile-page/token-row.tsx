import type { EvmChainIds, SolanaNetworkIds } from "@waifufun/types";
import type { TChain } from "@waifufun/types";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CopyButton } from "../copy-button";
/** BNB has 18 decimals; 1 BNB = 1e18 wei */
const WEI_PER_UNIT = 1e18;
import Verified from "../verified";

export default function TokenRow({
	data,
	mode = "activity",
	verified,
}: {
	data: {
		image: string;
		title: string;
		ticker: string;
		marketCap?: number;
		contractAddress: string;
		amountHeld?: number;
		dollarWorth?: number;
		points?: number;
		chain: TChain | null;
		chainId: SolanaNetworkIds | EvmChainIds | null;
		direction?: 0 | 1;
		amountGotten?: number;
		swapAmount?: number;
		createdAt?: string;
		signature?: string;
	};
	mode?: "activity" | "wallet" | "points";
	verified?: boolean;
}) {
	const dollarWorth = (data?.amountHeld ?? 0) * (data?.dollarWorth ?? 0);

	// Token detail route is /token/[chain]/[chainId]/[contractAddress]; fall back
	// to BSC (evm/56) when chain/chainId are unset, matching agents-tab.tsx.
	const tokenHref = `/token/${data.chain ?? "evm"}/${data.chainId ?? 56}/${data.contractAddress}`;

	// formats really high decimal amounts
	const formatAmount = (value?: string | number) =>
		value != null
			? (Number(value) / 1e6).toLocaleString("en-US", {
					maximumFractionDigits: 6,
				})
			: "0";

	return (
		<div className="group w-full border-b border-[rgba(255,255,255,0.04)] last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors relative flex justify-between items-center h-[71px] p-2 sm:p-4 py-4 sm:py-8">
			<div className="flex items-center space-x-2 sm:space-x-4 flex-nowrap overflow-hidden">
				<Link href={tokenHref} className="flex-shrink-0 flex items-center">
					{data.image ? (
						<Image
							src={data.image}
							unoptimized
							priority
							alt="Token Image"
							width={30}
							height={30}
							className="object-contain md:w-[40px] md:h-[40px] rounded-sm"
						/>
					) : (
						// honest fallback: a neutral monogram tile, never the banned
						// "N/A" placeholder (.impeccable.md). first letter of the ticker.
						<span
							aria-hidden
							className="inline-flex h-[30px] w-[30px] md:h-[40px] md:w-[40px] shrink-0 items-center justify-center rounded-sm bg-white/[0.04] font-mono text-[11px] uppercase text-[#71717a]"
						>
							{(data.ticker || data.title || "?").slice(0, 1)}
						</span>
					)}
				</Link>
				<div className="flex items-start gap-2 h-full min-w-0 pr-2">
					<div className="flex flex-col justify-center min-w-0">
						<div className="flex items-center gap-1 sm:gap-2 flex-nowrap overflow-hidden">
							<Link href={tokenHref} className="truncate max-w-full">
								<p className="text-[10px] sm:text-xs uppercase leading-none truncate hover:text-[#00ff87] text-[#e4e4e7] cursor-pointer">
									{data.title}
								</p>
							</Link>
							<p className="text-[10px] sm:text-xs text-[#71717a] leading-none flex-shrink-0">${data.ticker}</p>
						</div>
						<p className="text-[9px] sm:text-xs text-[#71717a] leading-none flex gap-x-1 items-center overflow-hidden mt-1">
							<CopyButton
								className="h-[8px] w-[8px] sm:h-[10px] sm:w-[10px] flex-shrink-0"
								textToCopy={data.contractAddress}
							/>
							<span className="truncate">{`${data?.contractAddress?.slice(0, 4)}...${data?.contractAddress?.slice(-3)}`}</span>
						</p>
					</div>
					<div className="-mt-1 size-4">{verified && <Verified isVerified={true} />}</div>
				</div>
			</div>

			{mode === "activity" || mode === "wallet" ? (
				<div className="flex items-center justify-end flex-row space-x-2 sm:space-x-4 min-w-0">
					<div className="flex flex-col items-end space-y-0 text-right min-w-0">
						{mode === "activity" ? (
							<div className="w-full flex-shrink-0">
								<div className="flex flex-row space-x-0.5 sm:space-x-1 justify-end w-full flex-nowrap overflow-hidden">
									<p
										className={`text-[9px] sm:text-xs uppercase font-bold flex-shrink-0 ${
											data.direction === 0 ? "text-green-500" : "text-red-500"
										}`}
									>
										{data.direction === 0 ? "bought" : "sold"}
									</p>
									<p className="text-[9px] sm:text-xs uppercase font-semibold text-[#e4e4e7] inline truncate">
										{data.direction === 0 ? (
											<>
												{formatAmount(data.amountGotten)} <span className="text-[#a1a1aa]">${data?.ticker}</span> for{" "}
												{(data.swapAmount ?? 0) / WEI_PER_UNIT} BNB
											</>
										) : (
											<>
												{formatAmount(data.swapAmount)} <span className="text-[#a1a1aa]">${data?.ticker}</span> for{" "}
												{(data.amountGotten ?? 0) / WEI_PER_UNIT} BNB
											</>
										)}
									</p>
								</div>
								<p className="text-[8px] sm:text-xs text-[#71717a] mt-0.5 sm:mt-1 text-right truncate">
									{data.createdAt
										? new Date(data.createdAt).toLocaleString("en-US", {
												day: "numeric",
												month: "short",
												year: "numeric",
												hour: "numeric",
												minute: "2-digit",
											})
										: ""}
								</p>
							</div>
						) : null}

						<div className="flex flex-col space-y-0 w-full items-end justify-center transition-all duration-300 mt-1">
							<p className="text-sm font-medium text-[#e4e4e7]">{data.amountHeld?.toLocaleString()}</p>
							{data?.dollarWorth ? (
								<p className="text-[#00ff87] text-xs sm:text-xs">${dollarWorth.toLocaleString()}</p>
							) : null}
						</div>
					</div>
					{mode === "activity" ? (
						<div className="flex justify-end items-center text-[#e4e4e7] text-base h-[60px] pl-2 flex-shrink-0">
							<Link
								href={mode === "activity" ? `https://bscscan.com/tx/${data.signature}` : tokenHref}
								target={mode === "activity" ? "_blank" : undefined}
							>
								<ExternalLink className="transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0 hover:bg-accent text-[#71717a] hover:text-[#00ff87] h-[14px] w-[14px] sm:h-[16px] sm:w-[16px]" />
							</Link>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
