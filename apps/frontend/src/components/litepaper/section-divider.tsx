"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export default function SectionDivider() {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.8 }}
			className="flex items-center justify-center gap-6 px-6 py-4"
		>
			<div className="h-px flex-1 max-w-[200px] bg-gradient-to-r from-transparent to-waifu-green/20" />
			<div className="relative h-6 w-6 overflow-hidden rounded-full border border-white/10 bg-white/5 opacity-40">
				<Image src="/brand/icon/icon_1024.png" alt="" fill className="object-cover" sizes="24px" />
			</div>
			<div className="h-px flex-1 max-w-[200px] bg-gradient-to-l from-transparent to-waifu-green/20" />
		</motion.div>
	);
}
