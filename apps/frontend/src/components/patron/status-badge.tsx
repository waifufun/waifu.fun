"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { PatronAgentStatus } from "@/lib/api/patron";
import { cn } from "@/lib/utils";

const STYLES: Record<PatronAgentStatus, string> = {
	provisioned: "bg-[#00ff87]/10 text-[#00ff87] border-[#00ff87]/30",
	active: "bg-[#00ff87]/10 text-[#00ff87] border-[#00ff87]/30",
	dormant: "bg-stroke text-[#a1a1aa] border-stroke-strong",
	killed: "bg-red-500/10 text-red-400 border-red-500/30",
};

const LABEL_KEYS: Record<PatronAgentStatus, string> = {
	provisioned: "patron.status.provisioned",
	active: "patron.status.active",
	dormant: "patron.status.dormant",
	killed: "patron.status.killed",
};

export default function StatusBadge({ status }: { status: PatronAgentStatus }) {
	const { t } = useTranslation();
	const labelKey = LABEL_KEYS[status];
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border uppercase tracking-wide",
				STYLES[status] ?? STYLES.dormant,
			)}
		>
			<span
				className={cn(
					"w-1.5 h-1.5 rounded-full",
					status === "active" || status === "provisioned"
						? "bg-[#00ff87]"
						: status === "killed"
							? "bg-red-400"
							: "bg-[#71717a]",
				)}
				aria-hidden
			/>
			{labelKey ? t(labelKey) : status}
		</span>
	);
}
