"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/locale-context";

const filterKeys = ["all", "trending", "new", "bonded"] as const;

interface ExplorerHeaderProps {
	tokenCount?: number;
}

export default function ExplorerHeader({ tokenCount = 0 }: ExplorerHeaderProps) {
	const { t } = useTranslation();
	const [active, setActive] = useState<string>("all");

	return (
		<div className="flex flex-col gap-5 mb-4">
			{/* Section header */}
			<div className="flex flex-col gap-3">
				<div className="flex items-end justify-between gap-4 flex-wrap">
					<div className="flex items-baseline gap-3">
						<h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#a1a1aa]">
							{t("explorer.exploreAgents")}
						</h2>

						{/* Live count */}
						<AnimatePresence mode="wait">
							<motion.div
								key={tokenCount}
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -6 }}
								className="flex items-center gap-1.5"
							>
								<div className="w-1 h-1 rounded-full bg-[#22c55e]" />
								<span className="text-xs font-mono text-[#52525b]">{tokenCount} {t("explorer.live")}</span>
							</motion.div>
						</AnimatePresence>
					</div>
				</div>

				{/* Hairline rule */}
				<div className="h-px w-full bg-[rgba(255,255,255,0.04)]" />
			</div>

			{/* Filter pills */}
			<div className="flex items-center gap-2 flex-wrap">
				{filterKeys.map((filter) => (
					<motion.button
						key={filter}
						onClick={() => setActive(filter)}
						className={`
							relative px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest
							border transition-colors duration-200
							${
								active === filter
									? "border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)]"
									: "border-transparent bg-transparent hover:bg-[rgba(255,255,255,0.02)]"
							}
						`}
						whileTap={{ scale: 0.97 }}
					>
						<span
							className={`relative z-10 ${
								active === filter ? "text-[#e4e4e7]" : "text-[#52525b] hover:text-[#71717a]"
							}`}
						>
							{t(`explorer.${filter}`)}
						</span>
					</motion.button>
				))}
			</div>
		</div>
	);
}
