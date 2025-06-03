import type { IToken } from "@autofun/types";
import Image from "next/image";

export default function FleekAgent({ token }: { token: IToken }) {
	return (
		<div className="w-full group rounded-lg place-self-center bg-[#0C0C0C] relative flex items-center h-[150px] p-4">
			<Image
				src={token.agent?.image || ""}
				height={150}
				width={150}
				alt={`${token.agent?.name} Agent Avatar Image`}
				className="rounded-md"
			/>
			<div className="flex flex-col justify-start h-[150px] ml-4 gap-y-1">
				<p className="text-autofun-background-action-highlight text-xl mb-1 font-semibold">{token.agent?.name}</p>
				<div className="flex items-center gap-1">
					<p className="text-base text-white leading-none font-semibold">Created by {token?.agent?.createdBy}</p>
				</div>
				<div className="flex items-center gap-1 mt-4">
					<p className="text-base text-autofun-stroke-light leading-none font-semibold">
						{!token?.agent?.bio.length ? "No bio provided" : token?.agent?.bio}
					</p>
				</div>
			</div>
		</div>
	);
}
