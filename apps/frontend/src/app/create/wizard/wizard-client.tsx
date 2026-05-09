"use client";

import { AuthGateLoader } from "@/components/auth/auth-gate-loader";
import ProvisioningLoader from "@/components/create/provisioning-loader";
import StepLaunchpad from "@/components/create/step-launchpad";
import StepPersona from "@/components/create/step-persona";
import StepReview from "@/components/create/step-review";
import StepRuntime from "@/components/create/step-runtime";
import StepSafe from "@/components/create/step-safe";
import StepTier from "@/components/create/tier/step-tier";
import WizardShell from "@/components/create/wizard-shell";
import {
	LAUNCHPAD_PICKER_ENABLED,
	STORAGE_KEY,
	WizardStateProvider,
	useWizard,
} from "@/components/create/wizard-state";
import { useAuthRequired } from "@/hooks/use-auth-required";
import { type ProvisionResult, buildProvisionPayload, provisionAgent } from "@/lib/api/agent-provision";
import { type CreateLaunchResult, createLaunch, requestLaunchNonce } from "@/lib/api/launches";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useSignMessage } from "wagmi";
import { PROVISION_RESPONSE_TIMEOUT_MS } from "./wizard-constants";
import { provisionSuccessRoute, provisionSuccessStorageKey } from "./wizard-provision-success";

export { PROVISION_RESPONSE_TIMEOUT_MS };

function randomSiweNonce(): string {
	const bytes = new Uint8Array(12);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

async function launchNonceOrFallback(address: string): Promise<string> {
	try {
		return await requestLaunchNonce(address);
	} catch (err) {
		if (isEndpointUnavailable(err)) return randomSiweNonce();
		throw err;
	}
}

function isEndpointUnavailable(err: unknown): boolean {
	return Boolean(
		err &&
			typeof err === "object" &&
			"status" in err &&
			typeof (err as { status?: unknown }).status === "number" &&
			(err as { status: number }).status === 404,
	);
}

function buildLaunchSiweMessage(address: string, nonce: string): string {
	const origin = window.location.origin;
	const domain = window.location.host;
	const issuedAt = new Date().toISOString();
	const expirationTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
	return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nsign to confirm launch. waifu.fun will use this wallet as creator for the launch transaction.\n\nURI: ${origin}/create/wizard\nVersion: 1\nChain ID: 56\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expirationTime}`;
}

function WizardInner() {
	const router = useRouter();
	const { state } = useWizard();
	const { address: connectedAddress } = useAccount();
	const { signMessageAsync } = useSignMessage();
	const [provisioning, setProvisioning] = useState(false);
	const [signingLaunch, setSigningLaunch] = useState(false);
	const [awaitingProvisionResponse, setAwaitingProvisionResponse] = useState(false);
	const provisionPromise = useRef<Promise<ProvisionResult> | null>(null);
	const launchPromise = useRef<Promise<CreateLaunchResult> | null>(null);

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

	const startLaunchCreate = useCallback(
		async (launchAuthorization: { creator: string; siwe: { message: string; signature: string } }) => {
			if (launchPromise.current) return;
			if (!state.launch.tierId) return;
			const promise = createLaunch({
				inviteCode: state.inviteCode.trim(),
				persona: {
					name: state.persona.name.trim(),
					ticker: state.persona.ticker.trim(),
					bio: state.persona.bio.trim(),
					personaPrompt: state.persona.personaPrompt.trim() || null,
					avatarTemplateId: state.persona.avatarTemplateId,
					hasAvatarUpload: Boolean(state.persona.avatarDataUrl),
				},
				tier: state.launch.tierId,
				runtime:
					state.runtime.kind === "webhook"
						? {
								kind: "webhook",
								webhookUrl: state.runtime.webhookUrl.trim(),
								webhookSecret: state.runtime.webhookSecret,
							}
						: { kind: state.runtime.kind },
				safe: {
					taxAgentBps: state.safe.taxAgentBps,
					taxPatronBps: state.safe.taxPatronBps,
					owners: state.safe.owners ?? [],
					threshold: state.safe.threshold ?? 1,
					firstBuyFundingSource: state.safe.firstBuyFundingSource ?? null,
					adapters: [
						{ slug: "pancake", enabled: state.safe.adapters.pancake },
						{ slug: "venus", enabled: state.safe.adapters.venus },
					],
				},
				launchAuthorization,
			});
			launchPromise.current = promise;
		},
		[state],
	);

	const handleComplete = useCallback(async () => {
		if (!connectedAddress) {
			toast.error("connect an evm wallet to confirm launch on-chain");
			return;
		}

		setSigningLaunch(true);
		try {
			toast.info("sign to confirm launch");
			const nonce = await launchNonceOrFallback(connectedAddress);
			const message = buildLaunchSiweMessage(connectedAddress, nonce);
			const signature = await signMessageAsync({ message });
			void startLaunchCreate({ creator: connectedAddress, siwe: { message, signature } });
			setProvisioning(true);
			startProvisioning();
		} catch (err) {
			const message = err instanceof Error ? err.message : "signature cancelled";
			toast.error(message || "signature cancelled");
		} finally {
			setSigningLaunch(false);
		}
	}, [connectedAddress, signMessageAsync, startProvisioning, startLaunchCreate]);

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

		// W48: prefer routing to /launch/[id] when the tier-aware create
		// endpoint succeeded. Falls through to legacy provision routing on
		// any failure (incl. 404 not_wired) so behavior stays unchanged in
		// the legacy flow.
		let launchResult: CreateLaunchResult | null = null;
		if (launchPromise.current) {
			try {
				launchResult = await launchPromise.current;
			} catch (err) {
				launchResult = {
					ok: false,
					reason: "server",
					message: err instanceof Error ? err.message : "launch create failed",
				};
			}
		}

		// Clear the wizard draft on any terminal outcome so a fresh /create/wizard
		// visit starts clean.
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// best effort
		}

		if (launchResult?.ok) {
			if (result?.ok && result.agentApiKey) {
				window.sessionStorage.setItem(provisionSuccessStorageKey(result), result.agentApiKey);
			}
			router.push(`/launch/${encodeURIComponent(launchResult.id)}`);
			return;
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
					tier: <StepTier />,
					launchpad: LAUNCHPAD_PICKER_ENABLED ? <StepLaunchpad /> : null,
					runtime: <StepRuntime />,
					safe: <StepSafe />,
					review: <StepReview />,
				}}
				onComplete={handleComplete}
				provisioning={provisioning || signingLaunch}
				completeLabel={signingLaunch ? "signing..." : "sign to confirm launch"}
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
