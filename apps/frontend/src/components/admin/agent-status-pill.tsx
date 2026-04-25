import type { AdminCombinedStatus } from "@/lib/api/admin";

const STYLES: Record<AdminCombinedStatus, { bg: string; text: string; border: string; label: string }> = {
	live: {
		bg: "bg-emerald-500/10",
		text: "text-emerald-300",
		border: "border-emerald-500/30",
		label: "live",
	},
	"paused-brain": {
		bg: "bg-amber-500/10",
		text: "text-amber-300",
		border: "border-amber-500/30",
		label: "paused brain",
	},
	"frozen-withdrawals": {
		bg: "bg-orange-500/10",
		text: "text-orange-300",
		border: "border-orange-500/30",
		label: "frozen withdrawals",
	},
	dormant: {
		bg: "bg-neutral-500/10",
		text: "text-neutral-300",
		border: "border-neutral-500/30",
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
