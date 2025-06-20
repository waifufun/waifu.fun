"use client";
import { motion } from "framer-motion";
import { GridItem } from "./grid-item";
import type { IToken } from "@autofun/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getTokens } from "@/lib/api";
import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function TokenGrid() {
	const columns = 5;
	const columnKeys = Array.from({ length: columns }, (_, i) => `col${i + 1}`);

	const searchParams = useSearchParams();
	const category = searchParams.get("category");
	const origin = searchParams.get("origin")

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
		queryKey: ["main-page-tokens", category, origin],
		queryFn: async ({ pageParam = 1 }) => {
			const res = await getTokens({ searchParams: { page: pageParam, category: category ?? undefined, origin: origin ?? undefined } });
			return res as IToken[];
		},
		getNextPageParam: (lastPage, allPages) => {
			return lastPage.length < 50 ? undefined : allPages.length + 1;
		},
		initialPageParam: 1,
	});

	const tokens: IToken[] = data?.pages.flat() ?? [];
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
		<div>
			<div className="columns-1 sm:columns-2 md:columns-3 lg:columns-5 gap-4 space-y-4">
				{columnKeys.map((colKey, colIndex) => {
					const columnItems = tokens?.filter((_, idx) => idx % columns === colIndex);
					return (
						<motion.div
							key={colKey}
							className="flex flex-col space-y-4"
							initial={{ opacity: 0, y: -250, rotateX: 50 }}
							animate={{ opacity: 1, y: 0, rotateX: 0 }}
							transition={{
								delay: colIndex * 0.35,
								type: "spring",
								stiffness: 25,
								damping: 7,
							}}
						>
							{columnItems?.map((token) => (
								<GridItem key={token?.contractAddress} token={token} />
							))}
						</motion.div>
					);
				})}
				<div ref={loaderRef} className="h-10 w-full" />
			</div>
			<div>
				{isFetchingNextPage && (
					<div className="mt-2 place-items-center">
						<div className="w-full flex justify-center animate-spin text-muted-foreground">
							<LoaderCircle className="h-10 w-10 text-[#03FF23]" />
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
