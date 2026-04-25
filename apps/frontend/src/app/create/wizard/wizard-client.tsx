"use client";

import { useRouter } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import ProvisioningLoader from "@/components/create/provisioning-loader";
import StepPersona from "@/components/create/step-persona";
import StepReview from "@/components/create/step-review";
import StepRuntime from "@/components/create/step-runtime";
import StepSafe from "@/components/create/step-safe";
import WizardShell from "@/components/create/wizard-shell";
import { STORAGE_KEY, useWizard, WizardStateProvider } from "@/components/create/wizard-state";
import { buildProvisionPayload, provisionAgent, type ProvisionResult } from "@/lib/api/agent-provision";

function WizardInner() {
	const router = useRouter();
	const { state } = useWizard();
	const [provisioning, setProvisioning] = useState(false);
	const provisionResult = useRef<ProvisionResult | null>(null);
	const provisionStarted = useRef(false);

	const startProvisioning = useCallback(async () => {
		if (provisionStarted.current) return;
		provisionStarted.current = true;
		const payload = buildProvisionPayload(state);
		const result = await provisionAgent(payload);
		provisionResult.current = result;
	}, [state]);

	const handleComplete = useCallback(() => {
		setProvisioning(true);
		// Kick off the real network call in parallel with the loader animation.
		// Result lands in provisionResult.current; we read it once the loader
		// finishes its choreography.
		void startProvisioning();
	}, [startProvisioning]);

	const handleProvisioningDone = useCallback(() => {
		const result = provisionResult.current;

		// Clear the wizard draft on any terminal outcome so a fresh /create/wizard
		// visit starts clean.
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// best effort
		}

		if (result?.ok) {
			router.push(`/patron/${encodeURIComponent(result.agentId)}?just_provisioned=true`);
			return;
		}

		// Failure modes: not_wired, network, server, validation, or simply
		// not-yet-resolved (shouldn't happen since loader runs ~5.6s and
		// the request is fired immediately). All paths route to /patron with
		// a contextual toast.
		const message =
			!result || result.reason === "not_wired" || result.reason === "network"
				? "backend wiring coming soon. your config is saved."
				: result.reason === "validation"
					? `validation failed: ${result.message}`
					: `provision failed: ${result.message}`;

		const isStub = !result || result.reason === "not_wired" || result.reason === "network";
		if (isStub) {
			toast.success(message);
		} else {
			toast.error(message);
		}

		router.push("/patron");
	}, [router]);

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
			{provisioning ? <ProvisioningLoader onDone={handleProvisioningDone} /> : null}
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
