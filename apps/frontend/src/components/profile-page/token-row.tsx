import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "../copy-button";

export default function TokenRow({
	data,
}: {
	data: {
		tokenImageUrl: string;
		tokenTitle: string;
		tokenTicker: string;
		marketCap: number;
		contractAddress: string;
		amountHeld: number;
		dollarWorth: number;
	};
}) {
	return (
		<div className="group rounded-lg bg-black hover:bg-[#0C0C0C] relative flex justify-between items-center w-full max-w-[750px] h-[94px] px-4 py-2 transition-all duration-300 hover:translate-x-[-30px]">
			<div className="flex items-center">
				<div className="w-[60px] h-[60px] mr-4">
					<Image src={data.tokenImageUrl} alt="Token Image" width={60} height={60} className="object-contain" />
				</div>

				<div className="flex flex-col justify-center min-w-[140px]">
					<div className="flex items-center gap-1">
						<Image
							src={"/chain-icons/ethereum.svg"}
							alt="chain icon"
							width={24}
							height={24}
							className="object-contain"
						/>
						<p className="text-xl text-white uppercase mr-1 leading-none">{data.tokenTitle}</p>
						<p className="text-base text-[#8C8C8C] leading-none">${data.tokenTicker}</p>
					</div>
					<p className="text-base mt-3 ml-1.5 text-[#8C8C8C] leading-none">
						<CopyButton textToCopy={data.contractAddress} />{" "}
						{`${data.contractAddress.slice(0, 6)}...${data.contractAddress.slice(-4)}`}
					</p>
				</div>
			</div>

			{/* Right section: Market Cap, Divider, Held, External Link */}
			<div className="flex items-center">
				<div className="flex flex-col justify-center mr-8 min-w-[120px]">
					<p className="text-xs text-[#8C8C8C] uppercase">Mcap</p>
					<p className="text-white font-semibold">${data.marketCap.toLocaleString()}</p>
				</div>

				<div className="h-[60%] w-[1px] bg-red-500 mx-4" />

				<div className="flex flex-col justify-center mr-8 min-w-[120px]">
					<p className="text-xs text-[#8C8C8C] uppercase">Held</p>
					<p className="text-white font-semibold">{data.amountHeld}</p>
					<p className="text-[#8C8C8C] text-sm">${data.dollarWorth.toLocaleString()}</p>
				</div>

				<div className="bg-red-500 relative">
					<div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
						<ExternalLink size={20} className="text-white" />
					</div>
				</div>
			</div>
		</div>
	);
}
