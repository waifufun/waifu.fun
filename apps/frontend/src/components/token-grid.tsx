"use client";
import { GridItem } from "./grid-item";
import type { IToken } from "@waifufun/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

/** When true, only use the tokens passed from the server (mock); never hit the API. */
const USE_MOCK_TOKENS_ONLY = true;

function formatMarketCap(mc: number): string {
	if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}m`;
	if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}k`;
	return `$${mc}`;
}

/** Cinematic hero card component */
function HeroCard({ token, index }: { token: IToken; index: number }) {
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = token?.curveCompleted || curveProgress >= 100;

	return (
		<motion.div
			initial={{ opacity: 1, y: 0 }}
		>
			<Link
				href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
				className="block group"
			>
				<motion.div
					className="relative w-full overflow-hidden rounded-sm bg-[#111114] border border-[rgba(255,255,255,0.06)]"
					whileHover={{
						boxShadow: "0 0 60px rgba(0,255,135,0.1), 0 20px 60px rgba(0,0,0,0.5)",
						borderColor: "rgba(0,255,135,0.25)",
					}}
					transition={{ type: "spring", stiffness: 260, damping: 24 }}
				>
					{/* HUD corner accents */}
					<div className="absolute top-0 left-0 w-16 h-16 pointer-events-none">
						<div className="absolute top-4 left-4 w-8 h-px bg-gradient-to-r from-[#00ff87] to-transparent" />
						<div className="absolute top-4 left-4 w-px h-8 bg-gradient-to-b from-[#00ff87] to-transparent" />
					</div>
					<div className="absolute top-0 right-0 w-16 h-16 pointer-events-none">
						<div className="absolute top-4 right-4 w-8 h-px bg-gradient-to-l from-[#00ff87] to-transparent" />
						<div className="absolute top-4 right-4 w-px h-8 bg-gradient-to-b from-[#00ff87] to-transparent" />
					</div>

					{/* Main content - cinematic layout */}
					<div className="flex flex-col lg:flex-row">
						{/* Image section - large */}
						<div className="relative w-full lg:w-[55%] h-[280px] sm:h-[340px] lg:h-[420px] overflow-hidden">
							<motion.div
								className="absolute inset-0"
								whileHover={{ scale: 1.03 }}
								transition={{ duration: 0.8, ease: "easeOut" }}
							>
								<Image
									src={token.image}
									fill
									unoptimized
									alt={token.name}
									className="object-cover"
								/>
							</motion.div>
							{/* Gradient overlays */}
							<div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[rgba(17,17,20,0.95)] hidden lg:block" />
							<div className="absolute inset-0 bg-gradient-to-t from-[rgba(17,17,20,0.9)] via-transparent to-transparent lg:hidden" />

							{/* Rank badge */}
							{index === 0 && (
								<div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[rgba(17,17,20,0.8)] border border-[rgba(0,255,135,0.25)]">
									<span className="text-lg">🔥</span>
									<span className="text-xs font-mono uppercase tracking-wider text-[#00ff87]">
										#1 trending
									</span>
								</div>
							)}
						</div>

						{/* Content section */}
						<div className="flex-1 flex flex-col justify-between p-6 lg:p-8 lg:pl-4">
							{/* Top content */}
							<div className="flex flex-col gap-4">
								{/* Status badges */}
								<div className="flex items-center gap-2 flex-wrap">
									{isBonded && (
										<div className="px-3 py-1 rounded-full bg-[rgba(0,255,135,0.1)] border border-[rgba(0,255,135,0.25)]">
											<span className="text-[10px] font-mono uppercase tracking-wider text-[#00ff87]">
												bonded
											</span>
										</div>
									)}
									{token.verified && (
										<div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[rgba(0,255,135,0.08)] border border-[rgba(0,255,135,0.2)]">
											<span className="text-[#00ff87]">✓</span>
											<span className="text-[10px] font-mono uppercase tracking-wider text-[#00ff87]">
												verified
											</span>
										</div>
									)}
								</div>

								{/* Name and ticker */}
								<div>
									<h3 className="text-3xl sm:text-4xl font-bold text-[#e4e4e7] leading-tight mb-2">
										{token.name}
									</h3>
									<span className="text-xl font-mono text-[#00ff87]">
										${token.ticker}
									</span>
								</div>

								{/* Description */}
								{token.description && (
									<p className="text-sm text-[#71717a] leading-relaxed max-w-md">
										{token.description.length > 160
											? token.description.slice(0, 160).trimEnd() + "…"
											: token.description}
									</p>
								)}
							</div>

							{/* Bottom stats bar */}
							<div className="mt-6 pt-4 border-t border-[rgba(255,255,255,0.06)]">
								<div className="flex items-center gap-6 flex-wrap">
									{token.marketcap > 0 && (
										<div className="flex flex-col">
											<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
												market cap
											</span>
											<span className="text-lg font-bold text-[#e4e4e7]">
												{formatMarketCap(token.marketcap)}
											</span>
										</div>
									)}
									{token.holders > 0 && (
										<div className="flex flex-col">
											<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
												holders
											</span>
											<span className="text-lg font-bold text-[#e4e4e7]">
												{token.holders.toLocaleString()}
											</span>
										</div>
									)}
									{token.volume24h > 0 && (
										<div className="flex flex-col">
											<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
												24h volume
											</span>
											<span className="text-lg font-bold text-[#e4e4e7]">
												{formatMarketCap(token.volume24h)}
											</span>
										</div>
									)}
									{/* Price */}
									{token.price && (
										<div className="ml-auto">
											<span className="text-xs font-mono text-[#52525b]">
												${Number(token.price).toFixed(6)}
											</span>
										</div>
									)}
								</div>

								{/* Bonding curve progress */}
								{!isBonded && (
									<div className="mt-4">
										<div className="flex items-center justify-between mb-2">
											<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
												bonding progress
											</span>
											<span className="text-xs font-mono text-[#00ff87]">
												{curveProgress}%
											</span>
										</div>
										<div className="w-full h-2 rounded-sm bg-[rgba(255,255,255,0.06)] overflow-hidden">
											<motion.div
												className="h-full rounded-sm bg-gradient-to-r from-[#065f46] via-[#22c55e] to-[#00ff87]"
												initial={{ width: 0 }}
												animate={{ width: `${curveProgress}%` }}
												transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
											/>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Bottom HUD accents */}
					<div className="absolute bottom-0 left-0 w-16 h-16 pointer-events-none">
						<div className="absolute bottom-4 left-4 w-8 h-px bg-gradient-to-r from-[#00ff87] to-transparent" />
						<div className="absolute bottom-4 left-4 w-px h-8 bg-gradient-to-t from-[#00ff87] to-transparent" />
					</div>
					<div className="absolute bottom-0 right-0 w-16 h-16 pointer-events-none">
						<div className="absolute bottom-4 right-4 w-8 h-px bg-gradient-to-l from-[#00ff87] to-transparent" />
						<div className="absolute bottom-4 right-4 w-px h-8 bg-gradient-to-t from-[#00ff87] to-transparent" />
					</div>
				</motion.div>
			</Link>
		</motion.div>
	);
}

export default function TokenGrid({ tokens }: { tokens: IToken[] }) {
	const searchParams = useSearchParams();
	const category = searchParams.get("category") || null;
	const origin = searchParams.get("origin") || null;

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
		queryKey: ["main-page-tokens", category, origin, USE_MOCK_TOKENS_ONLY],
		queryFn: async ({ pageParam = 1 }) => {
			if (USE_MOCK_TOKENS_ONLY) return pageParam === 1 ? tokens : [];
			const { getTokens } = await import("@/lib/api");
			const res = await getTokens({
				searchParams: { page: pageParam, category: category ?? undefined, origin: origin ?? undefined },
			});
			return res as IToken[];
		},
		getNextPageParam: (lastPage, allPages) => {
			if (USE_MOCK_TOKENS_ONLY) return undefined;
			return lastPage.length < 50 ? undefined : allPages.length + 1;
		},
		initialPageParam: 1,
		initialData: {
			pages: [tokens],
			pageParams: [1],
		},
		refetchInterval: USE_MOCK_TOKENS_ONLY ? false : 10000,
		refetchOnMount: !USE_MOCK_TOKENS_ONLY,
	});

	const allTokens: IToken[] = data?.pages.flat() ?? [];
	const loaderRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
					fetchNextPage();
				}
			},
			{ threshold: 1.0 },
		);

		if (loaderRef.current) observer.observe(loaderRef.current);

		return () => {
			if (loaderRef.current) observer.unobserve(loaderRef.current);
		};
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	// Separate featured (hero) token from the rest
	const featuredToken = allTokens.find((t) => t.featured);
	const remainingTokens = allTokens.filter((t) => t !== featuredToken);

	// Split remaining tokens for varied layout
	const firstRowTokens = remainingTokens.slice(0, 2);  // 2 larger cards
	const secondRowTokens = remainingTokens.slice(2, 5); // 3 medium cards
	const restTokens = remainingTokens.slice(5);         // 3-column grid

	return (
		<Fragment>
			<div
				className="flex flex-col gap-8 w-full"
			>
				{/* Hero featured card - full width cinematic */}
				{featuredToken && (
					<HeroCard token={featuredToken} index={0} />
				)}

				{/* Gradient divider */}
				{featuredToken && remainingTokens.length > 0 && (
					<div className="relative py-4">
						<div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.2)] to-transparent" />
						<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#00ff87] blur-sm" />
						<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[#22c55e]" />
					</div>
				)}

				{/* First row - 2 larger cards */}
				{firstRowTokens.length > 0 && (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
						{firstRowTokens.map((token, idx) => (
							<div key={token.contractAddress}>
								<GridItem token={token} variant="large" rank={idx + 2} />
							</div>
						))}
					</div>
				)}

				{/* Second row - 3 medium cards */}
				{secondRowTokens.length > 0 && (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
						{secondRowTokens.map((token, idx) => (
							<div key={token.contractAddress}>
								<GridItem 
									token={token} 
									variant="medium" 
									rank={firstRowTokens.length + idx + 2} 
								/>
							</div>
						))}
					</div>
				)}

				{/* Rest - 3-column compact grid */}
				{restTokens.length > 0 && (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{restTokens.map((token, idx) => (
							<div key={token.contractAddress}>
								<GridItem 
									token={token} 
									variant="compact"
									rank={firstRowTokens.length + secondRowTokens.length + idx + 2}
								/>
							</div>
						))}
					</div>
				)}

				{/* Infinite scroll sentinel */}
				<div ref={loaderRef} className="h-10 w-full" />
			</div>

			{isFetchingNextPage && (
				<div className="mt-4 flex justify-center">
					<LoaderCircle className="h-8 w-8 text-[#00ff87] animate-spin" />
				</div>
			)}
		</Fragment>
	);
}
