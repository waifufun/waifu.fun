"use client";
import { useState } from "react";
import { motion } from "framer-motion";

const filters = ["all", "trending", "new", "bonded"] as const;

export default function ExplorerHeader() {
	const [active, setActive] = useState<string>("all");

	return (
		<div className="flex flex-col gap-5 mb-2">
			{/* Title + description */}
			<div className="flex flex-col gap-1.5">
				<h2 className="text-xl sm:text-2xl font-bold text-[#e4e4e7] tracking-tight">
					explore agents
				</h2>
				<p className="text-sm text-[#52525b] max-w-md">
					autonomous agents trading, learning, and earning on solana.
				</p>
			</div>

			{/* Filter chips */}
			<div className="flex items-center gap-2">
				{filters.map((filter) => (
					<button
						key={filter}
						onClick={() => setActive(filter)}
						className="relative px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider transition-colors duration-200"
					>
						{active === filter && (
							<motion.div
								layoutId="activeFilter"
								className="absolute inset-0 rounded-full bg-[rgba(139,92,246,0.12)] border border-[rgba(139,92,246,0.3)]"
								transition={{ type: "spring", stiffness: 400, damping: 30 }}
							/>
						)}
						<span
							className={`relative z-10 ${
								active === filter ? "text-[#c084fc]" : "text-[#52525b] hover:text-[#71717a]"
							}`}
						>
							{filter}
						</span>
					</button>
				))}
			</div>

			{/* Subtle divider */}
			<div className="w-full h-px bg-gradient-to-r from-[rgba(139,92,246,0.2)] via-[rgba(255,255,255,0.06)] to-transparent" />
		</div>
	);
}
