"use client";

import { createContext, useContext, useReducer, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
	draftReducer,
	initialDraft,
	WIZARD_STEPS,
	type WaifuDraft,
	type DraftMode,
	type WizardStep,
} from "./draft-reducer";

interface DraftContextValue {
	draft: WaifuDraft;
	currentStepName: WizardStep;
	stepIndex: number;
	totalSteps: number;
	setMode: (mode: DraftMode) => void;
	next: () => void;
	back: () => void;
	goTo: (step: number) => void;
	setImportAddress: (address: string) => void;
	reset: () => void;
	isFirstStep: boolean;
	isLastStep: boolean;
}

const DraftContext = createContext<DraftContextValue | undefined>(undefined);

export function DraftProvider({ children }: { children: ReactNode }) {
	const [draft, dispatch] = useReducer(draftReducer, initialDraft);

	const setMode = useCallback((mode: DraftMode) => dispatch({ type: "SET_MODE", mode }), []);
	const next = useCallback(() => dispatch({ type: "NEXT_STEP" }), []);
	const back = useCallback(() => dispatch({ type: "PREV_STEP" }), []);
	const goTo = useCallback((step: number) => dispatch({ type: "GO_TO_STEP", step }), []);
	const setImportAddress = useCallback(
		(address: string) => dispatch({ type: "SET_IMPORT_ADDRESS", address }),
		[],
	);
	const reset = useCallback(() => dispatch({ type: "RESET" }), []);

	const value = useMemo<DraftContextValue>(
		() => ({
			draft,
			currentStepName: WIZARD_STEPS[draft.step] ?? "entry",
			stepIndex: draft.step,
			totalSteps: WIZARD_STEPS.length,
			setMode,
			next,
			back,
			goTo,
			setImportAddress,
			reset,
			isFirstStep: draft.step === 0,
			isLastStep: draft.step === WIZARD_STEPS.length - 1,
		}),
		[draft, setMode, next, back, goTo, setImportAddress, reset],
	);

	return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
	const ctx = useContext(DraftContext);
	if (!ctx) throw new Error("useDraft must be used within a DraftProvider");
	return ctx;
}
