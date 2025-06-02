"use client";
import { Input } from "./ui/input";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTokens } from "@/lib/api";
import Image from "next/image";
import ChainIndicator from "./chain-indicator";
import Verified from "./verified";
import { CopyButton } from "./copy-button";
import { abbreviateNumber, shortenAddress } from "@/lib/utils";
import type { IToken } from "@autofun/types";
import Link from "next/link";

export default function SearchMenu() {
	const [open, setOpen] = useState<boolean>(false);
	const [value, setValue] = useState<string>("");

	const searchQuery = useQuery({
		queryKey: ["search", value],
		queryFn: async () => {
			if (value?.length === 0) {
				if (open) {
					setOpen(false);
				}
				return [];
			}
			if (!open) {
				setOpen(true);
			}
			const data = await getTokens({ searchParams: { category: "marketcap", page: 1, limit: 5, search: value } });
			return data as IToken[];
		},
		refetchInterval: 10_000,
	});

	return (
		<Fragment>
			<Popover open={open} onOpenChange={(a) => setOpen(a)}>
				<PopoverTrigger autoFocus={false}>
					<Input
						placeholder="Search..."
						value={value}
						onChange={(e) => setValue(e.target.value)}
						className="w-[430px] h-11 hidden md:inline-block"
					/>
				</PopoverTrigger>
				<PopoverContent
					onOpenAutoFocus={(e) => e.preventDefault()}
					onCloseAutoFocus={(e) => e.preventDefault()}
					className="w-[430px] border-[#262626] rounded-lg bg-gradient-to-b from-[#151515] to-[#0D0D0D]"
				>
					{searchQuery?.isPending ? (
						<div className="text-center text-base text-autofun-text-secondary">Searching...</div>
					) : searchQuery?.data?.length ? (
						<div className="flex flex-col gap-1.5">
							{searchQuery?.data?.map((token) => (
								<Link
									href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
									key={token.contractAddress}
									onClick={() => setOpen(false)}
								>
									<div className="rounded-lg hover:bg-[#0C0C0C] p-3 transition-colors duration-200 flex items-center gap-4 justify-between">
										<div className="flex items-center gap-3">
											{/* Image */}
											<Image
												src={token.image}
												width={48}
												height={48}
												unoptimized
												alt="token_image"
												className="size-[48px] rounded-lg"
											/>
											{/* Token Name */}
											<div className="flex flex-col gap-2.5">
												{/* Name */}
												<div className="flex items-center gap-1.5">
													<ChainIndicator chain={token.chain} chainId={token.chainId} />
													<span className="text-white text-base font-medium font-satoshi uppercase">{token.name}</span>
													<span className="text-base font-medium uppercase text-autofun-text-secondary">
														{token.ticker}
													</span>
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

										<div className="flex flex-col gap-2 items-end">
											<span className="font-medium text-base text-white">Mcap</span>
											<span className="font-medium text-base text-autofun-background-action-highlight">
												{abbreviateNumber(token?.marketcap)}
											</span>
										</div>
									</div>
								</Link>
							))}
						</div>
					) : (
						<div className="text-center text-base text-autofun-text-secondary">No results found.</div>
					)}
				</PopoverContent>
			</Popover>
		</Fragment>
	);
}
