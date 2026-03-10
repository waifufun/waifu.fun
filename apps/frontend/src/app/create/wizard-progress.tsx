"use client";

import { WIZARD_STEPS, STEP_LABELS } from "./draft-reducer";
import { useDraft } from "./draft-context";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function WizardProgress() {
	const { stepIndex, draft, goTo } = useDraft();

	return (
		<div className="w-full mb-8">
			<div className="flex items-center justify-between">
				{WIZARD_STEPS.map((stepName, idx) => {
					const isActive = idx === stepIndex;
					const isCompleted = idx < stepIndex;
					const isVisited = draft.visited[idx];
					const canNavigate = isVisited && idx < stepIndex;

					return (
						<div key={stepName} className="flex items-center flex-1 last:flex-none">
							<div className="flex flex-col items-center">
								<button
									type="button"
									onClick={() => canNavigate && goTo(idx)}
									disabled={!canNavigate}
									className={cn(
										"w-8 h-8 flex items-center justify-center text-xs font-bold transition-all border-2",
										isActive &&
											"bg-[#00FF87] text-black border-[#00FF87] shadow-[0_0_12px_rgba(0,255,135,0.4)]",
										isCompleted &&
											"bg-[#00FF87]/20 text-[#00FF87] border-[#00FF87]/60 hover:bg-[#00FF87]/30 cursor-pointer",
										!isActive &&
											!isCompleted &&
											"bg-black text-gray-600 border-gray-700",
										"rounded-none",
									)}
								>
									{isCompleted ? <Check size={14} /> : idx + 1}
								</button>
								<span
									className={cn(
										"text-[10px] mt-1.5 uppercase tracking-wider font-semibold text-center whitespace-nowrap",
										isActive && "text-[#00FF87]",
										isCompleted && "text-[#00FF87]/60",
										!isActive && !isCompleted && "text-gray-600",
									)}
								>
									{STEP_LABELS[stepName]}
								</span>
							</div>

							{idx < WIZARD_STEPS.length - 1 && (
								<div
									className={cn(
										"flex-1 h-[2px] mx-2 mt-[-1rem]",
										idx < stepIndex ? "bg-[#00FF87]/40" : "bg-gray-800",
									)}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
