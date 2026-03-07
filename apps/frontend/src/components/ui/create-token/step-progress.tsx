"use client";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
interface Step {
	label: string;
	description?: string;
}
interface StepProgressProps {
	steps: Step[];
	currentStep: number;
	className?: string;
}
export function StepProgress({ steps, currentStep, className }: StepProgressProps) {
	return (
		<div className={cn("w-full", className)}>
			<div className="flex items-center justify-between relative">
				<div className="absolute top-4 left-0 right-0 h-[2px] bg-[rgba(255,255,255,0.06)]" />
				<div
					className="absolute top-4 left-0 h-[2px] bg-[#00ff87] transition-all duration-500"
					style={{ width: `${(currentStep / (steps.length - 1)) * 100}%`, boxShadow: "0 0 8px rgba(0,255,135,0.5)" }}
				/>
				{steps.map((step, i) => {
					const completed = i < currentStep;
					const current = i === currentStep;
					const pending = i > currentStep;
					return (
						<div key={step.label} className="relative flex flex-col items-center z-10">
							<div
								className={cn(
									"w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase transition-all",
									completed && "bg-[#00ff87] text-[#08080a] shadow-[0_0_12px_rgba(0,255,135,0.4)]",
									current && "bg-[#00ff87] text-[#08080a] shadow-[0_0_16px_rgba(0,255,135,0.6)] animate-pulse",
									pending && "bg-[#111114] border border-[rgba(255,255,255,0.1)] text-[#52525b]",
								)}
							>
								{completed ? <Check size={14} strokeWidth={3} /> : i + 1}
							</div>
							<span
								className={cn(
									"mt-2 text-xs uppercase tracking-wider font-medium",
									completed && "text-[#00ff87]",
									current && "text-[#e4e4e7]",
									pending && "text-[#52525b]",
								)}
							>
								{step.label}
							</span>
							{step.description && (
								<span
									className={cn(
										"text-[10px] text-center max-w-[80px] mt-0.5",
										current ? "text-[#a1a1aa]" : "text-[#52525b]",
									)}
								>
									{step.description}
								</span>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
