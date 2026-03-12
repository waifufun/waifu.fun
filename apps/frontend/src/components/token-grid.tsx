"use client";

import { GridItem } from "./grid-item";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.12,
		},
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 12 },
	visible: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.5,
			ease: "easeOut" as const,
		},
	},
};

export default function TokenGrid({ tokens }: { tokens: IToken[] }) {
	const featuredToken = tokens[0];
	if (!featuredToken) return null;

	const secondaryTokens = tokens.slice(1);

	return (
		<motion.div
			className="flex flex-col gap-8 w-full"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			{/* Featured card: first token, full width */}
			<motion.div variants={itemVariants}>
				<GridItem token={featuredToken} variant="featured" />
			</motion.div>

			{/* Secondary cards: remaining tokens in grid */}
			{secondaryTokens.length > 0 && (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
					{secondaryTokens.map((token) => (
						<motion.div key={token.contractAddress} variants={itemVariants}>
							<GridItem token={token} variant="standard" />
						</motion.div>
					))}
				</div>
			)}
		</motion.div>
	);
}
