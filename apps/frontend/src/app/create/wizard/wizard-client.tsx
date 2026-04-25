"use client";

import { Suspense } from "react";
import StepPersona from "@/components/create/step-persona";
import StepRuntime from "@/components/create/step-runtime";
import WizardShell from "@/components/create/wizard-shell";
import { WizardStateProvider } from "@/components/create/wizard-state";

function StepPlaceholder({ label }: { label: string }) {
	return (
		<div className="border border-white/5 bg-white/[0.015] p-8">
			<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</p>
			<p className="mt-3 text-sm text-neutral-400 leading-relaxed">This step lands in the next commit.</p>
		</div>
	);
}

function WizardInner() {
	return (
		<WizardShell
			stepContent={{
				persona: <StepPersona />,
				runtime: <StepRuntime />,
				safe: <StepPlaceholder label="Step 3 / Safe and policies" />,
				review: <StepPlaceholder label="Step 4 / Review" />,
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
