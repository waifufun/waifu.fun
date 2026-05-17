"use client";

import { useLaunchpads } from "@/hooks/use-launchpads";
import type { LaunchpadDescriptor, LaunchpadId } from "@/lib/launchpad/types";
import { useCallback, useState } from "react";
import { LaunchpadCard } from "./launchpad-card";
import { LaunchpadComingSoonModal } from "./launchpad-coming-soon-modal";

type Props = {
	selectedId: LaunchpadId | null;
	onSelect: (descriptor: LaunchpadDescriptor) => void;
};

export default function LaunchpadPicker({ selectedId, onSelect }: Props) {
	const { launchpads, isLoading, error, source } = useLaunchpads();
	const [waitlistFor, setWaitlistFor] = useState<LaunchpadDescriptor | null>(null);

	const handleCardClick = useCallback(
		(descriptor: LaunchpadDescriptor) => {
			if (descriptor.status === "coming-soon") {
				setWaitlistFor(descriptor);
				return;
			}
			onSelect(descriptor);
		},
		[onSelect],
	);

	if (isLoading && launchpads.length === 0) {
		return <PickerSkeleton />;
	}

	return (
		<div className="flex flex-col gap-6">
			{error ? (
				<p className="text-[11px] font-mono text-neutral-500">
					running on local mock launchpad list (api unreachable).
				</p>
			) : null}

			<div
				role="radiogroup"
				aria-label="select launchpad"
				className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
			>
				{launchpads.map((d) => (
					<LaunchpadCard key={d.id} descriptor={d} selected={selectedId === d.id} onSelect={() => handleCardClick(d)} />
				))}
			</div>

			<div className="flex items-center justify-between gap-3 flex-wrap pt-1">
				<p
					className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500"
					data-testid="chain-roadmap-hint"
				>
					<span className="text-neutral-300">bsc</span>
					<span className="text-neutral-600"> / </span>
					more chains coming soon
				</p>
				{source === "mock" ? (
					<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						note: api unavailable, using local list.
					</p>
				) : null}
			</div>

			<LaunchpadComingSoonModal
				descriptor={waitlistFor}
				open={waitlistFor !== null}
				onClose={() => setWaitlistFor(null)}
			/>
		</div>
	);
}

function PickerSkeleton() {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			{Array.from({ length: 6 }).map((_, i) => (
				<div
					key={`skel-${i.toString()}`}
					className="border border-white/5 bg-white/[0.012] min-h-[220px] p-5 animate-pulse"
				>
					<div className="h-3 w-12 bg-white/5" />
					<div className="mt-5 h-4 w-32 bg-white/8" />
					<div className="mt-3 h-3 w-full bg-white/5" />
					<div className="mt-2 h-3 w-3/4 bg-white/5" />
				</div>
			))}
		</div>
	);
}
