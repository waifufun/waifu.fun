"use client";

import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "../wizard-icons";

type Props = {
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
	label?: string;
};

/**
 * W48 launch submit button. Visually consistent with the wizard footer's
 * "next/provision" CTA but reusable from the review step or anywhere else
 * that needs to fire `POST /v2/launches`.
 */
export function SubmitButton({ onClick, disabled, loading, label = "launch agent." }: Props) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled || loading}
			data-testid="launch-submit-button"
			className={cn(
				"group inline-flex items-center gap-3 h-11 pl-5 pr-2 text-sm font-medium tracking-tight",
				"bg-accent text-black",
				"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
				"hover:bg-accent-dim active:translate-y-[1px]",
				"disabled:bg-neutral-800 disabled:text-neutral-600 disabled:pointer-events-none",
			)}
		>
			<span>{loading ? "launching..." : label}</span>
			<span
				className={cn(
					"inline-flex items-center justify-center h-7 w-7 bg-black/15",
					"transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
					"group-hover:translate-x-0.5",
				)}
			>
				<ArrowRightIcon className="h-3.5 w-3.5" />
			</span>
		</button>
	);
}
