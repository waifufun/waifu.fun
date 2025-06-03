import type { IToken } from "@autofun/types";
import Image from "next/image";

export default function FleekAgent({ token }: { token: IToken }) {
	return (
		<div className="group rounded-lg bg-transparent place-self-center hover:bg-[#0C0C0C] relative flex justify-between items-center w-[750px] h-[94px] px-4 py-2">
			<div className="flex items-center">

					

				<div className="flex flex-col justify-center min-w-[140px]">
					<div className="flex items-center gap-1">
						<p className="text-xl text-white uppercase mr-1 leading-none">{token?.agent?.name}</p>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-x-8 place-items-end transition-all duration-300 ease-in-out group-hover:gap-x-10">
				<div className="flex flex-col h-full w-full space-y-1 justify-end transition-all duration-300">{token?.agent?.bio}</div>
				<div className="self-stretch w-px bg-[#1E1E1E]" />
				<div className="w-0 overflow-hidden group-hover:w-px transition-all duration-300 ease-in-out self-stretch bg-[#1E1E1E]" />
				Created by {token?.agent?.createdBy}
			</div>
		</div>
	);
}
