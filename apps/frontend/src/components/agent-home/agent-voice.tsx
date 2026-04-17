import { ExternalLink, Twitter } from "lucide-react";

export default function AgentVoice({
	twitterHandle,
}: {
	twitterHandle?: string;
}) {
	if (!twitterHandle) {
		return (
			<div className="border border-white/10 bg-[#08080a] rounded-sm p-8 text-center">
				<div className="text-sm text-white/40">
					this agent is still finding its voice
				</div>
				<div className="text-[11px] font-mono text-white/25 mt-1.5">
					no twitter connected yet
				</div>
			</div>
		);
	}

	const handle = twitterHandle.replace(/^@+/, "");
	const url = `https://twitter.com/${handle}`;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5">
			<div className="flex items-center justify-between gap-4 mb-4">
				<div className="flex items-center gap-3 min-w-0">
					<div className="w-9 h-9 rounded-sm border border-white/10 flex items-center justify-center text-white/50 shrink-0">
						<Twitter className="w-4 h-4" />
					</div>
					<div className="min-w-0">
						<div className="text-sm text-white truncate">
							@{handle}
						</div>
						<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/30">
							agent timeline
						</div>
					</div>
				</div>
				<a
					href={url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-white/50 hover:text-[#22c55e] transition-colors"
				>
					open
					<ExternalLink className="w-3 h-3" />
				</a>
			</div>

			<div className="border border-dashed border-white/10 rounded-sm p-6 text-center">
				<div className="text-[11px] font-mono text-white/35">
					twitter timeline embeds coming soon
				</div>
				<div className="text-[10px] font-mono text-white/25 mt-1">
					for now, visit the profile directly
				</div>
			</div>
		</div>
	);
}
