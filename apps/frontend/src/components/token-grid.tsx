"use client";
import { motion } from "framer-motion";
import { GridItem } from "./grid-item";
import type { IToken } from "@autofun/types";

export default function TokenGrid({ tokens }: { tokens: IToken[] }) {
	const columns = 5;

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
			{tokens.map((token, idx) => {
				const col = idx % columns;
				const row = Math.floor(idx / columns);
				const delay = col * 0.45 + row * 0.05;

				return (
					<motion.div
						key={token.contractAddress}
						initial={{ opacity: 0, y: 150, rotateX: 30 }}
						animate={{ opacity: 1, y: 0, rotateX: 0 }}
						transition={{
							delay,
							type: "spring",
							stiffness: 50,
							damping: 6,
						}}
					>
						<GridItem token={token} />
					</motion.div>
				);
			})}
		</div>
	);
}
