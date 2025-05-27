"use client";

import Image from "next/image";
import { CopyButton } from "../copy-button";

export default function ProfileHeader({
	data,
}: {
	data: {
		username: string;
		address: string;
		tokensBought: number;
		tokensCreated: number;
	};
}) {
	return (
		<div className="bg-[#0C0C0C] text-white flex items-center justify-between p-4 rounded-xl w-full max-w-4xl mx-auto">
			{/* Left: Profile Image with overlay buttons */}
			<div className="relative w-[150px] h-[150px]">
				<Image src="/create/test-img.png" alt="Profile" width={150} height={150} className="object-cover" />
				<div className="absolute px-2 w-full justify-between top-2  flex gap-2">
					<button
						type="button"
						onClick={() => console.log("upload button")}
						className="cursor-pointerbg-[#0C0C0C]/90 rounded-md p-1 w-6 h-6"
					>
						<Image src="/profile/upload.svg" alt="Profile" width={14} height={14} className="object-cover" />
					</button>
					<button
						type="button"
						onClick={() => console.log("refresh button")}
						className="cursor-pointer bg-[#0C0C0C]/90 rounded-md p-1 w-6 h-6"
					>
						<Image src="/profile/rotate.svg" alt="Profile" width={14} height={14} className="object-cover" />
					</button>
				</div>
			</div>

			{/* Middle: Username, Wallet Address, Icon Buttons */}
			<div className="ml-6 flex flex-col h-full">
				<h1 className="text-[18px] font-semibold uppercase">{data.username}</h1>
				<p className="text-[14px] text-gray-400 items-center flex">
					{" "}
					<CopyButton className="mr-2" textToCopy={data.address} />
					{data.address}
				</p>
				<div className="flex gap-2 mt-2">
					{["/solana.svg", "/ethereum-bold.svg", "/base.svg"].map((icon, index) => (
						<div key={index} className="bg-[#171717] bg-opacity-10 p-2 rounded-md flex items-center justify-center">
							<Image src={`/chain-icons/${icon}`} alt={`icon-${index}`} width={24} height={24} />
							<p className="px-2">1.88</p>
						</div>
					))}
				</div>
			</div>

			{/* Right: Token Stats */}
			<div className="flex flex-col items-end gap-2 ml-auto">
				<div className="bg-[#0C0C0C] flex flex-row items-center space-x-2 p-3 rounded-lg">
					<p className="text-white font-bold">Tokens Bought</p>
					<p className="text-lg font-semibold">{data.tokensBought}</p>
				</div>
				<div className="bg-[#0C0C0C] text-[16px] p-3 rounded-lg">
					<p className="text-white">Tokens Created</p>
					<p className="font-semibold">{data.tokensCreated}</p>
				</div>
			</div>
		</div>
	);
}
