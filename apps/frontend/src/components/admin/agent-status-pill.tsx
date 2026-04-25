import type { AdminCombinedStatus } from "@/lib/api/admin";

const STYLES: Record<AdminCombinedStatus, { bg: string; text: string; border: string; label: string }> = {
	live: {
		bg: "bg-[#00ff87]/10",
		text: "text-[#00ff87]",
		border: "border-[#00ff87]/30",
		label: "live",
	},
	"paused-brain": {
		bg: "bg-stroke",
		text: "text-[#a1a1aa]",
		border: "border-stroke-strong",
		label: "paused brain",
	},
	"frozen-withdrawals": {
		bg: "bg-stroke",
		text: "text-[#a1a1aa]",
		border: "border-stroke-strong",
		label: "frozen withdrawals",
	},
	dormant: {
		bg: "bg-stroke",
		text: "text-[#71717a]",
		border: "border-stroke-strong",
		label: "dormant",
	},
	killed: {
		bg: "bg-red-500/15",
		text: "text-red-300",
		border: "border-red-500/40",
		label: "killed",
	},
};

export default function StatusPill({ status }: { status: AdminCombinedStatus }) {
	const s = STYLES[status];
	return (
		<output
			className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm border ${s.bg} ${s.text} ${s.border}`}
			aria-label={`Agent status: ${s.label}`}
		>
			<span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />
			{s.label}
		</output>
	);
}
