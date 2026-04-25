"use client";

import { Suspense, useCallback, useState } from "react";
import ProvisioningLoader from "@/components/create/provisioning-loader";
import StepPersona from "@/components/create/step-persona";
import StepReview from "@/components/create/step-review";
import StepRuntime from "@/components/create/step-runtime";
import StepSafe from "@/components/create/step-safe";
import WizardShell from "@/components/create/wizard-shell";
import { WizardStateProvider } from "@/components/create/wizard-state";

function WizardInner() {
	const [provisioning, setProvisioning] = useState(false);

	const handleComplete = useCallback(() => {
		setProvisioning(true);
	}, []);

	const handleProvisioned = useCallback(() => {
		// Real wiring (success vs stub fallback) lands in commit 5.
		// For now, hold here until the next commit replaces this.
	}, []);

	return (
		<>
			<WizardShell
				stepContent={{
					persona: <StepPersona />,
					runtime: <StepRuntime />,
					safe: <StepSafe />,
					review: <StepReview />,
				}}
				onComplete={handleComplete}
				provisioning={provisioning}
			/>
			{provisioning ? <ProvisioningLoader onDone={handleProvisioned} /> : null}
		</>
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
