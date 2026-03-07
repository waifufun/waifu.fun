"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const filters = ["all", "trending", "new", "bonded"] as const;

interface ExplorerHeaderProps {
	tokenCount?: number;
}

export default function ExplorerHeader({ tokenCount = 0 }: ExplorerHeaderProps) {
	const [active, setActive] = useState<string>("all");

	return (
		<div className="flex flex-col gap-6 mb-6">
			{/* Editorial title section */}
			<div className="flex flex-col gap-4">
				<div className="flex items-end justify-between gap-4 flex-wrap">
					{/* Title with gradient */}
					<div className="flex items-baseline gap-4">
						<h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
							<span className="bg-gradient-to-r from-[#e4e4e7] via-[#22c55e] to-[#00ff87] bg-clip-text text-transparent">
								explore agents
							</span>
						</h2>

						{/* Animated count */}
						<AnimatePresence mode="wait">
							<motion.div
								key={tokenCount}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								className="flex items-center gap-2"
							>
								<span className="text-sm font-mono text-[#52525b]">/</span>
								<div className="flex items-center gap-1.5">
									<motion.div
										className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"
										animate={{
											scale: [1, 1.2, 1],
											opacity: [1, 0.7, 1],
										}}
										transition={{
											duration: 2,
											repeat: Number.POSITIVE_INFINITY,
											ease: "easeInOut",
										}}
									/>
									<span className="text-sm font-mono text-[#71717a]">{tokenCount} live</span>
								</div>
							</motion.div>
						</AnimatePresence>
					</div>
				</div>

				{/* Thin rule line */}
				<div className="relative h-px w-full">
					<div className="absolute inset-0 bg-gradient-to-r from-[#00ff87] via-[rgba(0,255,135,0.2)] to-transparent" />
				</div>
			</div>

			{/* Filter pills */}
			<div className="flex items-center gap-3 flex-wrap">
				{filters.map((filter) => (
					<motion.button
						key={filter}
						onClick={() => setActive(filter)}
						className={`
							relative px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest
							border transition-all duration-300
							${
								active === filter
									? "border-[rgba(0,255,135,0.25)] bg-[rgba(0,255,135,0.08)]"
									: "border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.4)] hover:border-[rgba(255,255,255,0.1)]"
							}
						`}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						{active === filter && (
							<motion.div
								layoutId="activeFilterPill"
								className="absolute inset-0 rounded-full bg-gradient-to-r from-[rgba(0,255,135,0.1)] to-[rgba(192,132,252,0.1)]"
								transition={{ type: "spring", stiffness: 400, damping: 30 }}
							/>
						)}
						<span
							className={`relative z-10 ${
								active === filter ? "text-[#00ff87]" : "text-[#52525b] hover:text-[#71717a]"
							}`}
						>
							{filter}
						</span>
					</motion.button>
				))}
			</div>
		</div>
	);
}
