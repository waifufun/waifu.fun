"use client";
import { motion } from "framer-motion";
import { GridItem } from "./grid-item";
import type { IToken } from "@autofun/types";

export default function TokenGrid({ tokens }: { tokens: IToken[] }) {
	const columns = 5;

	return (
		<div className="columns-1 sm:columns-2 md:columns-3 lg:columns-5 gap-4 space-y-4">
			{[...Array(columns)].map((_, colIndex) => {
				const columnItems = tokens.filter((_, idx) => idx % columns === colIndex);
				return (
					<motion.div
						key={colIndex}
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
						{columnItems.map((token) => (
							<GridItem key={token.contractAddress} token={token} />
						))}
					</motion.div>
				);
			})}
		</div>
	);
}
