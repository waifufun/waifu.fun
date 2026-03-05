"use client";
import { GridItem } from "./grid-item";
import type { IToken } from "@waifufun/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

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

	// Separate featured (hero) token from the rest
	const featuredToken = allTokens.find((t) => t.featured);
	const remainingTokens = allTokens.filter((t) => t !== featuredToken);

	// For very few tokens, use larger layout
	const isFewTokens = allTokens.length <= 3;

	const containerVariants = {
		hidden: { opacity: 0 },
		show: {
			opacity: 1,
			transition: {
				staggerChildren: 0.08,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 20 },
		show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
	};

	return (
		<Fragment>
			<motion.div
				className="flex flex-col gap-6 w-full"
				variants={containerVariants}
				initial="hidden"
				animate="show"
			>
				{/* Hero featured card */}
				{featuredToken && (
					<motion.div
						variants={itemVariants}
						className={isFewTokens ? "w-full" : "w-full lg:w-2/3"}
					>
						<GridItem token={featuredToken} variant="hero" />
					</motion.div>
				)}

				{/* Remaining tokens grid */}
				{remainingTokens.length > 0 && (
					<div
						className={`grid gap-6 w-full ${
							isFewTokens
								? "grid-cols-1 sm:grid-cols-2"
								: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
						}`}
					>
						{remainingTokens.map((token) => (
							<motion.div key={token.contractAddress} variants={itemVariants}>
								<GridItem
									token={token}
									variant={isFewTokens ? "hero" : "medium"}
								/>
							</motion.div>
						))}
					</div>
				)}

				{/* Infinite scroll sentinel */}
				<div ref={loaderRef} className="h-10 w-full" />
			</motion.div>

			{isFetchingNextPage && (
				<div className="mt-4 flex justify-center">
					<LoaderCircle className="h-8 w-8 text-[#8b5cf6] animate-spin" />
				</div>
			)}
		</Fragment>
	);
}
