"use client";

import { Input } from "./ui/input";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTokens } from "@/lib/api";
import Image from "next/image";
import { CopyButton } from "./copy-button";
import { abbreviateNumber, shortenAddress } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Command } from "lucide-react";

const PLACEHOLDER = "Search DAOs & Agents by name, symbol, or CA...";

export default function SearchMenu() {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const pathname = usePathname();
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (pathname) setValue("");
	}, [pathname]);

	useEffect(() => {
		if (!open) return;
		setValue("");
		const t = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(t);
	}, [open]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const searchQuery = useQuery({
		queryKey: ["search", value],
		queryFn: async () => {
			const data = await getTokens({
				searchParams: { category: "marketcap", page: 1, limit: 10, search: value },
			});
			return data as IToken[];
		},
		enabled: open && value.trim().length > 0,
		refetchInterval: 10_000,
	});

	const results = searchQuery?.data ?? [];
	const showResults = value.trim().length > 0;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="hidden md:flex items-center gap-2 w-[320px] xl:w-[400px] h-11 rounded-xl border border-white/20 bg-white/20 backdrop-blur-md hover:bg-white/30 hover:border-white/30 transition-colors text-left px-4 text-gray-500 hover:text-gray-700"
					aria-label="Search"
				>
					<Search className="size-4 shrink-0 text-gray-500" />
					<span className="flex-1 truncate text-sm font-medium">
						{PLACEHOLDER}
					</span>
					<span className="flex items-center gap-1 shrink-0 rounded-md bg-black/20 px-2 py-0.5 text-xs font-medium text-gray-600">
						<Command className="size-3" />K
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
				align="start"
				sideOffset={8}
				className="w-[90vw] max-w-2xl p-0 overflow-hidden rounded-xl border border-white/20 bg-white/15 backdrop-blur-xl shadow-xl"
			>
				{/* Search input inside card */}
				<div className="flex items-center gap-2 p-4 border-b border-white/10">
					<Search className="size-4 shrink-0 text-gray-500" />
					<Input
						ref={inputRef}
						placeholder={PLACEHOLDER}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						className="flex-1 h-11 bg-white/10 border-white/20 rounded-lg placeholder:text-gray-500 text-gray-900 font-medium focus-visible:ring-white/30"
						autoComplete="off"
					/>
					<span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-gray-600">
						<Command className="size-3" />K
					</span>
				</div>

				{/* Body */}
				<div className="min-h-[280px] max-h-[60vh] overflow-y-auto p-4">
					{!showResults && (
						<p className="text-center text-sm text-gray-500 py-12">
							Start typing to search DAOs & Agents...
						</p>
					)}
					{showResults && searchQuery?.isPending && (
						<p className="text-center text-sm text-gray-500 py-12">Searching...</p>
					)}
					{showResults && !searchQuery?.isPending && results.length === 0 && (
						<p className="text-center text-sm text-gray-500 py-12">No results found.</p>
					)}
					{showResults && !searchQuery?.isPending && results.length > 0 && (
						<div className="flex flex-col gap-1">
							{results.map((token) => (
								<Link
									href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
									key={token.contractAddress}
									onClick={() => setOpen(false)}
									className="rounded-lg p-3 hover:bg-white/15 transition-colors flex items-center gap-4 justify-between"
								>
									<div className="flex items-center gap-3 min-w-0">
										<Image
											src={token.image}
											width={48}
											height={48}
											unoptimized
											alt=""
											className="size-12 aspect-square rounded-lg object-cover shrink-0"
										/>
										<div className="flex flex-col gap-0.5 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="text-sm font-medium text-gray-900 truncate">
													{token.name}
												</span>
												<span className="text-sm font-medium text-gray-600 truncate">
													{token.ticker}
												</span>
											</div>
											<div className="flex items-center gap-2">
												<CopyButton textToCopy={token.contractAddress} />
												<span className="text-xs text-gray-500 font-medium truncate">
													{shortenAddress(token.contractAddress)}
												</span>
											</div>
										</div>
									</div>
									<div className="flex flex-col items-end shrink-0">
										<span className="text-xs text-gray-500 font-medium">Mcap</span>
										<span className="text-sm font-medium text-gray-900">
											{abbreviateNumber(token?.marketcap)}
										</span>
									</div>
								</Link>
							))}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
