import type { PatronAgentStatus } from "@/lib/api/patron";
import { cn } from "@/lib/utils";

const STYLES: Record<PatronAgentStatus, string> = {
	active: "bg-green-500/10 text-green-400 border-green-500/30",
	dormant: "bg-amber-500/10 text-amber-400 border-amber-500/30",
	killed: "bg-red-500/10 text-red-400 border-red-500/30",
};

const LABELS: Record<PatronAgentStatus, string> = {
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
					status === "active"
						? "bg-green-400"
						: status === "killed"
							? "bg-red-400"
							: "bg-amber-400",
				)}
				aria-hidden
			/>
			{LABELS[status] ?? status}
		</span>
	);
}
