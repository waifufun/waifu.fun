"use client";
import { GridItem } from "./grid-item";
import type { IToken } from "@waifufun/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

/** When true, only use the tokens passed from the server (mock); never hit the API. */
const USE_MOCK_TOKENS_ONLY = false;

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
				searchParams: {
					featured: "true",
					limit: 50,
					page: pageParam,
					category: category ?? undefined,
					origin: origin ?? undefined,
				},
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
		refetchInterval: USE_MOCK_TOKENS_ONLY ? false : 30000,
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

	// Sort by market cap, varied layout without redundant hero card
	const sortedByMarketCap = [...allTokens].sort((a, b) => (b.marketcap ?? 0) - (a.marketcap ?? 0));

	// Split tokens for varied layout
	const firstRowTokens = sortedByMarketCap.slice(0, 2); // 2 larger cards
	const secondRowTokens = sortedByMarketCap.slice(2, 5); // 3 medium cards
	const restTokens = sortedByMarketCap.slice(5); // 3-column grid

	return (
		<Fragment>
			<div className="flex flex-col gap-5 w-full">
				{/* First row — 2 featured cards */}
				{firstRowTokens.length > 0 && (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{firstRowTokens.map((token, idx) => (
							<div key={token.contractAddress}>
								<GridItem token={token} variant="large" rank={idx + 1} />
							</div>
						))}
					</div>
				)}

				{/* Second row — 3 medium cards */}
				{secondRowTokens.length > 0 && (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{secondRowTokens.map((token, idx) => (
							<div key={token.contractAddress}>
								<GridItem token={token} variant="medium" rank={firstRowTokens.length + idx + 1} />
							</div>
						))}
					</div>
				)}

				{/* Remaining — 3-column compact grid */}
				{restTokens.length > 0 && (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{restTokens.map((token, idx) => (
							<div key={token.contractAddress}>
								<GridItem
									token={token}
									variant="compact"
									rank={firstRowTokens.length + secondRowTokens.length + idx + 1}
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
					<LoaderCircle className="h-6 w-6 text-[#52525b] animate-spin" />
				</div>
			)}
		</Fragment>
	);
}
