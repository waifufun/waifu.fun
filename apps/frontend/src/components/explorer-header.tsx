"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "@/contexts/locale-context";

interface ExplorerHeaderProps {
	tokenCount?: number;
}

export default function ExplorerHeader({ tokenCount = 0 }: ExplorerHeaderProps) {
	const { t } = useTranslation();

	return (
		<div className="mb-2 flex flex-col gap-3">
			<div className="flex items-end justify-between gap-4">
				<div className="flex items-baseline gap-3">
					<h2 className="text-2xl font-semibold tracking-tight text-[#d4d4d8] sm:text-[2rem]">
						{t("explorer.exploreAgents")}
					</h2>
					<AnimatePresence mode="wait">
						<motion.div
							key={tokenCount}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							className="flex items-center gap-1.5"
						>
							<div className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
							<span className="text-xs font-mono text-[#71717a]">
								{tokenCount} {t("explorer.live")}
							</span>
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
			<div className="h-px w-full bg-[rgba(255,255,255,0.05)]" />
		</div>
	);
}
