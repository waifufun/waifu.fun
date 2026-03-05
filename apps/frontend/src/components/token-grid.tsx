"use client";
import { GridItem } from "./grid-item";
import type { IToken } from "@waifufun/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

/** When true, only use the tokens passed from the server (mock); never hit the API. */
const USE_MOCK_TOKENS_ONLY = true;

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

	return (
		<Fragment>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full auto-rows-min" style={{ gridAutoRows: "minmax(min-content, 240px)" }}>
				{allTokens?.map((token) => (
					<GridItem key={token?.contractAddress} token={token} />
				))}
				<div ref={loaderRef} className="h-10 w-full col-span-full" />
			</div>
			<div>
				{isFetchingNextPage && (
					<div className="mt-2 place-items-center">
						<div className="w-full flex justify-center animate-spin text-muted-foreground">
							<LoaderCircle className="h-8 w-8 text-[#8b5cf6]" />
						</div>
					</div>
				)}
			</div>
		</Fragment>
	);
}
