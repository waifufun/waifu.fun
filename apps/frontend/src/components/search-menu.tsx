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
	const [triggerHover, setTriggerHover] = useState(false);
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
					className="hidden md:flex items-center gap-2 w-[320px] xl:w-[400px] h-10 rounded-sm text-left px-3 transition-all duration-200"
					style={{
						background: "#111114",
						border: triggerHover
							? "1px solid rgba(255, 255, 255, 0.12)"
							: "1px solid rgba(255, 255, 255, 0.06)",
						color: "#71717a",
					}}
					onMouseEnter={() => setTriggerHover(true)}
					onMouseLeave={() => setTriggerHover(false)}
					aria-label="Search"
				>
					<Search className="size-4 shrink-0" style={{ color: "#71717a" }} />
					<span className="flex-1 truncate text-sm font-medium">{PLACEHOLDER}</span>
					<span
						className="flex items-center gap-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
						style={{
							background: "rgba(255, 255, 255, 0.06)",
							color: "#52525b",
						}}
					>
						<Command className="size-3" />K
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
				align="start"
				sideOffset={8}
				className="w-[90vw] max-w-2xl p-0 overflow-hidden rounded-sm shadow-2xl"
				style={{
					background: "#111114",
					border: "1px solid rgba(255, 255, 255, 0.06)",
					backdropFilter: "blur(20px)",
					WebkitBackdropFilter: "blur(20px)",
				}}
			>
				{/* Search input inside card */}
				<div
					className="flex items-center gap-2 p-4"
					style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
				>
					<Search className="size-4 shrink-0" style={{ color: "#71717a" }} />
					<Input
						ref={inputRef}
						placeholder={PLACEHOLDER}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						className="flex-1 h-10 rounded-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
						style={{
							background: "#0e0e12",
							border: "1px solid rgba(255, 255, 255, 0.06)",
							color: "#e4e4e7",
						}}
						autoComplete="off"
					/>
					<span
						className="hidden sm:inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium"
						style={{
							background: "rgba(255, 255, 255, 0.06)",
							color: "#52525b",
						}}
					>
						<Command className="size-3" />K
					</span>
				</div>

				{/* Body */}
				<div className="min-h-[280px] max-h-[60vh] overflow-y-auto p-4">
					{!showResults && (
						<p className="text-center text-sm py-12" style={{ color: "#52525b" }}>
							Start typing to search DAOs & Agents...
						</p>
					)}
					{showResults && searchQuery?.isPending && (
						<p className="text-center text-sm py-12" style={{ color: "#52525b" }}>
							Searching...
						</p>
					)}
					{showResults && !searchQuery?.isPending && results.length === 0 && (
						<p className="text-center text-sm py-12" style={{ color: "#52525b" }}>
							No results found.
						</p>
					)}
					{showResults && !searchQuery?.isPending && results.length > 0 && (
						<div className="flex flex-col gap-1">
							{results.map((token) => (
								<Link
									href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
									key={token.contractAddress}
									onClick={() => setOpen(false)}
									className="rounded-sm p-3 transition-colors flex items-center gap-4 justify-between"
									style={{ background: "transparent" }}
									onMouseEnter={(e) => (e.currentTarget.style.background = "#18181c")}
									onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
								>
									<div className="flex items-center gap-3 min-w-0">
										<Image
											src={token.image}
											width={48}
											height={48}
											unoptimized
											alt=""
											className="size-12 aspect-square rounded-sm object-cover shrink-0"
										/>
										<div className="flex flex-col gap-0.5 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<span
													className="text-sm font-medium truncate"
													style={{ color: "#e4e4e7" }}
												>
													{token.name}
												</span>
												<span
													className="text-sm font-medium truncate"
													style={{ color: "#71717a" }}
												>
													{token.ticker}
												</span>
											</div>
											<div className="flex items-center gap-2">
												<CopyButton textToCopy={token.contractAddress} />
												<span
													className="text-xs font-medium truncate"
													style={{ color: "#52525b" }}
												>
													{shortenAddress(token.contractAddress)}
												</span>
											</div>
										</div>
									</div>
									<div className="flex flex-col items-end shrink-0">
										<span className="text-xs font-medium" style={{ color: "#52525b" }}>
											Mcap
										</span>
										<span className="text-sm font-medium" style={{ color: "#e4e4e7" }}>
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
