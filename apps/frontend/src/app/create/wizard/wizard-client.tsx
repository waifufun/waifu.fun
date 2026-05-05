"use client";

import { AuthGateLoader } from "@/components/auth/auth-gate-loader";
import ProvisioningLoader from "@/components/create/provisioning-loader";
import StepLaunchpad from "@/components/create/step-launchpad";
import StepPersona from "@/components/create/step-persona";
import StepReview from "@/components/create/step-review";
import StepRuntime from "@/components/create/step-runtime";
import StepSafe from "@/components/create/step-safe";
import WizardShell from "@/components/create/wizard-shell";
import {
	LAUNCHPAD_PICKER_ENABLED,
	STORAGE_KEY,
	WizardStateProvider,
	useWizard,
} from "@/components/create/wizard-state";
import { useAuthRequired } from "@/hooks/use-auth-required";
import { type ProvisionResult, buildProvisionPayload, provisionAgent } from "@/lib/api/agent-provision";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { provisionSuccessRoute, provisionSuccessStorageKey } from "./wizard-provision-success";

export const PROVISION_RESPONSE_TIMEOUT_MS = 300_000;

function WizardInner() {
	const router = useRouter();
	const { state } = useWizard();
	const [provisioning, setProvisioning] = useState(false);
	const [awaitingProvisionResponse, setAwaitingProvisionResponse] = useState(false);
	const provisionPromise = useRef<Promise<ProvisionResult> | null>(null);

	const startProvisioning = useCallback(() => {
		if (provisionPromise.current) return;
		const payload = buildProvisionPayload(state);
		const promise = provisionAgent(payload);
		provisionPromise.current = promise;
		void promise.then(
			() => setAwaitingProvisionResponse(false),
			() => setAwaitingProvisionResponse(false),
		);
	}, [state]);

	const handleComplete = useCallback(() => {
		setProvisioning(true);
		// kick off the real network call in parallel with the loader animation.
		startProvisioning();
	}, [startProvisioning]);

	const handleProvisioningDone = useCallback(async () => {
		let result: ProvisionResult | null = null;
		try {
			if (provisionPromise.current) {
				setAwaitingProvisionResponse(true);
				const timeout = new Promise<ProvisionResult>((_, reject) => {
					window.setTimeout(
						() => reject(new Error("launch timed out; check your patron page")),
						PROVISION_RESPONSE_TIMEOUT_MS,
					);
				});
				result = await Promise.race([provisionPromise.current, timeout]);
			}
		} catch (err) {
			result = {
				ok: false,
				reason: "server",
				message: err instanceof Error ? err.message : "launch timed out; check your patron page",
			};
		} finally {
			setAwaitingProvisionResponse(false);
		}

		// Clear the wizard draft on any terminal outcome so a fresh /create/wizard
		// visit starts clean.
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// best effort
		}

		if (result?.ok) {
			if (result.agentApiKey) {
				window.sessionStorage.setItem(provisionSuccessStorageKey(result), result.agentApiKey);
			}
			router.push(provisionSuccessRoute(result));
			return;
		}

		// failure modes: not_wired, network, server, or validation. all paths
		// route to /patron with a contextual toast.
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
					launchpad: LAUNCHPAD_PICKER_ENABLED ? <StepLaunchpad /> : null,
					runtime: <StepRuntime />,
					safe: <StepSafe />,
					review: <StepReview />,
				}}
				onComplete={handleComplete}
				provisioning={provisioning}
			/>
			{provisioning ? (
				<ProvisioningLoader onDone={handleProvisioningDone} awaitingResponse={awaitingProvisionResponse} />
			) : null}
		</>
	);
}

function WizardGate() {
	const { isLoading, isAuthenticated } = useAuthRequired();
	if (isLoading) return <AuthGateLoader />;
	if (!isAuthenticated) return null;
	return (
		<WizardStateProvider>
			<Suspense fallback={<div className="min-h-[100dvh]" />}>
				<WizardInner />
			</Suspense>
		</WizardStateProvider>
	);
}

export default function WizardClient() {
	// useAuthRequired uses useSearchParams which requires a Suspense
	// boundary at or above its render site under the App Router.
	return (
		<Suspense fallback={<AuthGateLoader />}>
			<WizardGate />
		</Suspense>
	);
}
