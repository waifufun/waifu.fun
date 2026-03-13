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
	hidden: { opacity: 0, y: 14 },
	visible: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.55,
			ease: "easeOut" as const,
		},
	},
};

export default function TokenGrid({
	tokens,
	imageOverrides = {},
}: {
	tokens: IToken[];
	imageOverrides?: Record<string, string>;
}) {
	const [featuredToken, supportingToken] = tokens;
	if (!featuredToken) return null;

	const getImageOverride = (token: IToken) => {
		const contractAddress = token.contractAddress?.toLowerCase();
		return contractAddress ? imageOverrides[contractAddress] : undefined;
	};

	const featuredImageOverride = getImageOverride(featuredToken);
	const supportingImageOverride = supportingToken ? getImageOverride(supportingToken) : undefined;

	return (
		<motion.div
			className="grid grid-cols-1 gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div variants={itemVariants} className="min-w-0">
				<GridItem
					token={featuredToken}
					variant="hero"
					{...(featuredImageOverride ? { imageSrc: featuredImageOverride } : {})}
				/>
			</motion.div>

			{supportingToken && (
				<motion.div variants={itemVariants} className="min-w-0">
					<GridItem
						token={supportingToken}
						variant="portrait"
						{...(supportingImageOverride ? { imageSrc: supportingImageOverride } : {})}
					/>
				</motion.div>
			)}
		</motion.div>
	);
}
