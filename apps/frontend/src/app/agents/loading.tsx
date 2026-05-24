import AgentCardV2Skeleton from "@/components/agents-discover/agent-card-v2-skeleton";
import LoadingShell from "./loading-shell";

export default function Loading() {
	return (
		<div className="min-h-screen text-white">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pt-10 pb-24">
				<LoadingShell />
				<div className="h-12 border-y border-white/10" />
				<div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{Array.from({ length: 9 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<AgentCardV2Skeleton key={i} />
					))}
				</div>
			</div>
		</div>
	);
}
