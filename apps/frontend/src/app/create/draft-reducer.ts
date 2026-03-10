/**
 * WaifuDraft – canonical state machine for the 6-step create/import wizard.
 *
 * The draft is the single source of truth for *flow orchestration*. Form field
 * values still live in the PromptProvider's react-hook-form instance; this
 * reducer owns step progression, mode selection, and import-specific state.
 */

export const WIZARD_STEPS = [
	"entry",
	"identity",
	"token-provenance",
	"runtime",
	"owner-billing",
	"review-activate",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStep, string> = {
	entry: "Entry",
	identity: "Identity",
	"token-provenance": "Token & Provenance",
	runtime: "Runtime",
	"owner-billing": "Owner & Billing",
	"review-activate": "Review & Activate",
};

export type DraftMode = "create" | "import";

export interface WaifuDraft {
	mode: DraftMode | null;
	step: number;
	/** Import-specific: the contract address being imported */
	importContractAddress: string;
	/** Tracks which steps the user has visited */
	visited: Record<number, boolean>;
}

export const initialDraft: WaifuDraft = {
	mode: null,
	step: 0,
	importContractAddress: "",
	visited: { 0: true },
};

export type DraftAction =
	| { type: "SET_MODE"; mode: DraftMode }
	| { type: "NEXT_STEP" }
	| { type: "PREV_STEP" }
	| { type: "GO_TO_STEP"; step: number }
	| { type: "SET_IMPORT_ADDRESS"; address: string }
	| { type: "RESET" };

export function draftReducer(state: WaifuDraft, action: DraftAction): WaifuDraft {
	switch (action.type) {
		case "SET_MODE":
			return {
				...state,
				mode: action.mode,
				step: 1,
				visited: { ...state.visited, 1: true },
			};

		case "NEXT_STEP": {
			const next = Math.min(state.step + 1, WIZARD_STEPS.length - 1);
			return { ...state, step: next, visited: { ...state.visited, [next]: true } };
		}

		case "PREV_STEP": {
			const prev = Math.max(state.step - 1, 0);
			return { ...state, step: prev };
		}

		case "GO_TO_STEP": {
			if (action.step < 0 || action.step >= WIZARD_STEPS.length) return state;
			return { ...state, step: action.step, visited: { ...state.visited, [action.step]: true } };
		}

		case "SET_IMPORT_ADDRESS":
			return { ...state, importContractAddress: action.address };

		case "RESET":
			return initialDraft;

		default:
			return state;
	}
}
