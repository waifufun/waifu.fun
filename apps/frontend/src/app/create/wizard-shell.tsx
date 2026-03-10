"use client";

import { useDraft } from "./draft-context";
import { WizardProgress } from "./wizard-progress";
import { EntryStep } from "./steps/entry-step";
import { IdentityStep } from "./steps/identity-step";
import { TokenProvenanceStep } from "./steps/token-provenance-step";
import { RuntimeStep } from "./steps/runtime-step";
import { OwnerBillingStep } from "./steps/owner-billing-step";
import { ReviewActivateStep } from "./steps/review-activate-step";
import type React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

const STEP_COMPONENTS: Array<React.FC> = [
	EntryStep,
	IdentityStep,
	TokenProvenanceStep,
	RuntimeStep,
	OwnerBillingStep,
	ReviewActivateStep,
];

export function WizardShell() {
	const { stepIndex, next, back, isLastStep } = useDraft();

	const StepComponent = STEP_COMPONENTS[stepIndex] as React.FC;

	// Don't show nav for entry step (mode selection drives navigation)
	const showNav = stepIndex > 0;
	// Don't show "Next" on the last step (review has its own launch/import button)
	const showNext = showNav && !isLastStep;

	return (
		<div className="w-full max-w-4xl mx-auto">
			<WizardProgress />

			<div className="min-h-[400px]">
				{StepComponent ? <StepComponent /> : null}
			</div>

			{showNav && (
				<div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800">
					<Button
						type="button"
						onClick={back}
						variant="outline"
						className="h-10 border-2 border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10 hover:border-[#03FF24] rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.2)] font-bold uppercase text-xs px-6"
					>
						<ArrowLeft size={14} className="mr-2" />
						Back
					</Button>

					{showNext && (
						<Button
							type="button"
							onClick={next}
							className="h-10 bg-[#03FF24] hover:bg-[#02e020] text-black font-bold uppercase text-xs px-6 rounded-none shadow-[3px_3px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none"
						>
							Next
							<ArrowRight size={14} className="ml-2" />
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
