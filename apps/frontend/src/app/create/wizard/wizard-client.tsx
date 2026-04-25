"use client";

import { Suspense } from "react";
import StepPersona from "@/components/create/step-persona";
import StepReview from "@/components/create/step-review";
import StepRuntime from "@/components/create/step-runtime";
import StepSafe from "@/components/create/step-safe";
import WizardShell from "@/components/create/wizard-shell";
import { WizardStateProvider } from "@/components/create/wizard-state";

function WizardInner() {
	return (
		<WizardShell
			stepContent={{
				persona: <StepPersona />,
				runtime: <StepRuntime />,
				safe: <StepSafe />,
				review: <StepReview />,
			}}
			onComplete={() => {
				// Wired in commit 4/5.
			}}
		/>
	);
}

export default function WizardClient() {
	return (
		<WizardStateProvider>
			<Suspense fallback={<div className="min-h-[100dvh]" />}>
				<WizardInner />
			</Suspense>
		</WizardStateProvider>
	);
}
