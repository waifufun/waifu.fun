import type { PatronAgentStatus } from "@/lib/api/patron";
import { cn } from "@/lib/utils";

const STYLES: Record<PatronAgentStatus, string> = {
	provisioned: "bg-[#00ff87]/10 text-[#00ff87] border-[#00ff87]/30",
	active: "bg-[#00ff87]/10 text-[#00ff87] border-[#00ff87]/30",
	dormant: "bg-stroke text-[#a1a1aa] border-stroke-strong",
	killed: "bg-red-500/10 text-red-400 border-red-500/30",
};

const LABELS: Record<PatronAgentStatus, string> = {
	provisioned: "Ready to launch",
	active: "Active",
	dormant: "Dormant",
	killed: "Killed",
};

export default function StatusBadge({ status }: { status: PatronAgentStatus }) {
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
			{LABELS[status] ?? status}
		</span>
	);
}
