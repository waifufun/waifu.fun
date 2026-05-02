"use client";

import type { ChainId, LaunchpadFeeConfig, LaunchpadId } from "@/lib/launchpad/types";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";

/**
 * Feature flag controlling the launchpad picker step.
 * Default: off. When off, wizard runs the legacy four.meme-only flow.
 * W2.B handles the full cutover.
 */
export const LAUNCHPAD_PICKER_ENABLED = process.env.NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED === "true";

/** Wizard step identifiers. URL-synced via `?step=`. */
export type WizardStep = "persona" | "launchpad" | "runtime" | "safe" | "review";

export const LEGACY_WIZARD_STEPS: WizardStep[] = ["persona", "runtime", "safe", "review"];
export const LAUNCHPAD_WIZARD_STEPS: WizardStep[] = ["persona", "launchpad", "runtime", "safe", "review"];

export const WIZARD_STEPS: WizardStep[] = LAUNCHPAD_PICKER_ENABLED ? LAUNCHPAD_WIZARD_STEPS : LEGACY_WIZARD_STEPS;

export const STEP_LABELS: Record<WizardStep, string> = {
	persona: "persona",
	launchpad: "launchpad",
	runtime: "runtime",
	safe: "safe & policies",
	review: "review",
};

export type RuntimeKind = "hosted" | "webhook" | "pull";

export type WizardState = {
	persona: {
		name: string;
		ticker: string;
		bio: string;
		avatarDataUrl: string | null;
		avatarTemplateId: string | null;
		personaPrompt: string;
	};
	runtime: {
		kind: RuntimeKind;
		webhookUrl: string;
		webhookSecret: string;
	};
	safe: {
		taxAgentBps: number;
		taxPatronBps: number;
		adapters: { pancake: boolean; venus: boolean };
	};
	/**
	 * Launchpad selection + per-launchpad fee config.
	 * Populated only when LAUNCHPAD_PICKER_ENABLED. Legacy flow ignores this.
	 * W2.B will read this slice in the final provision payload.
	 */
	launchpad: {
		selectedId: LaunchpadId | null;
		selectedChain: ChainId | null;
		feeConfig: LaunchpadFeeConfig | null;
	};
};

export const DEFAULT_STATE: WizardState = {
	persona: {
		name: "",
		ticker: "",
		bio: "",
		avatarDataUrl: null,
		avatarTemplateId: "tessera",
		personaPrompt: "",
	},
	runtime: {
		kind: "hosted",
		webhookUrl: "",
		webhookSecret: "",
	},
	safe: {
		taxAgentBps: 8000,
		taxPatronBps: 2000,
		adapters: { pancake: true, venus: true },
	},
	launchpad: {
		selectedId: null,
		selectedChain: null,
		feeConfig: null,
	},
};

type Action =
	| { type: "patch_persona"; patch: Partial<WizardState["persona"]> }
	| { type: "patch_runtime"; patch: Partial<WizardState["runtime"]> }
	| { type: "patch_safe"; patch: Partial<WizardState["safe"]> }
	| { type: "patch_safe_adapters"; patch: Partial<WizardState["safe"]["adapters"]> }
	| { type: "patch_launchpad"; patch: Partial<WizardState["launchpad"]> }
	| { type: "reset" }
	| { type: "hydrate"; state: WizardState };

function reducer(state: WizardState, action: Action): WizardState {
	switch (action.type) {
		case "patch_persona":
			return { ...state, persona: { ...state.persona, ...action.patch } };
		case "patch_runtime":
			return { ...state, runtime: { ...state.runtime, ...action.patch } };
		case "patch_safe":
			return { ...state, safe: { ...state.safe, ...action.patch } };
		case "patch_safe_adapters":
			return { ...state, safe: { ...state.safe, adapters: { ...state.safe.adapters, ...action.patch } } };
		case "patch_launchpad":
			return { ...state, launchpad: { ...state.launchpad, ...action.patch } };
		case "reset":
			return DEFAULT_STATE;
		case "hydrate":
			return action.state;
		default:
			return state;
	}
}

export const STORAGE_KEY = "waifu-wizard-draft";

type Ctx = {
	state: WizardState;
	patchPersona: (p: Partial<WizardState["persona"]>) => void;
	patchRuntime: (p: Partial<WizardState["runtime"]>) => void;
	patchSafe: (p: Partial<WizardState["safe"]>) => void;
	patchAdapters: (p: Partial<WizardState["safe"]["adapters"]>) => void;
	patchLaunchpad: (p: Partial<WizardState["launchpad"]>) => void;
	reset: () => void;
};

const WizardContext = createContext<Ctx | null>(null);

/** Generate a 32-char hex secret without depending on Node's crypto types. */
function generateSecret(): string {
	const bytes = new Uint8Array(16);
	if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
		window.crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
	}
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function WizardStateProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
	const hydrated = useRef(false);

	// Load from localStorage on mount.
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<WizardState>;
				const merged: WizardState = {
					persona: { ...DEFAULT_STATE.persona, ...(parsed.persona ?? {}) },
					runtime: { ...DEFAULT_STATE.runtime, ...(parsed.runtime ?? {}) },
					safe: {
						...DEFAULT_STATE.safe,
						...(parsed.safe ?? {}),
						adapters: { ...DEFAULT_STATE.safe.adapters, ...(parsed.safe?.adapters ?? {}) },
					},
					launchpad: { ...DEFAULT_STATE.launchpad, ...(parsed.launchpad ?? {}) },
				};
				dispatch({ type: "hydrate", state: merged });
			}
		} catch {
			// corrupt draft (ignore)
		}
		hydrated.current = true;
	}, []);

	// Persist on changes (skip the very first render before hydration).
	useEffect(() => {
		if (!hydrated.current) return;
		if (typeof window === "undefined") return;
		try {
			// Avatar data URLs can be huge. Strip if oversized to stay within quota.
			const safeState: WizardState = {
				...state,
				persona: {
					...state.persona,
					avatarDataUrl:
						state.persona.avatarDataUrl && state.persona.avatarDataUrl.length < 250_000
							? state.persona.avatarDataUrl
							: null,
				},
			};
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
		} catch {
			// quota (best effort)
		}
	}, [state]);

	// Auto-generate webhook secret when user switches to webhook runtime and lacks one.
	useEffect(() => {
		if (state.runtime.kind === "webhook" && !state.runtime.webhookSecret) {
			dispatch({ type: "patch_runtime", patch: { webhookSecret: generateSecret() } });
		}
	}, [state.runtime.kind, state.runtime.webhookSecret]);

	const value = useMemo<Ctx>(
		() => ({
			state,
			patchPersona: (patch) => dispatch({ type: "patch_persona", patch }),
			patchRuntime: (patch) => dispatch({ type: "patch_runtime", patch }),
			patchSafe: (patch) => dispatch({ type: "patch_safe", patch }),
			patchAdapters: (patch) => dispatch({ type: "patch_safe_adapters", patch }),
			patchLaunchpad: (patch) => dispatch({ type: "patch_launchpad", patch }),
			reset: () => dispatch({ type: "reset" }),
		}),
		[state],
	);

	return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): Ctx {
	const ctx = useContext(WizardContext);
	if (!ctx) throw new Error("useWizard must be used inside WizardStateProvider");
	return ctx;
}

/** Validation per step. Returns null if valid, else short reason. */
export function validateStep(step: WizardStep, state: WizardState): string | null {
	switch (step) {
		case "persona": {
			const { name, ticker, bio } = state.persona;
			if (!name.trim()) return "pick a name";
			if (name.length > 48) return "name too long";
			if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return "ticker: 2-10 uppercase letters or digits";
			if (bio.length > 240) return "bio too long";
			return null;
		}
		case "launchpad": {
			if (!state.launchpad.selectedId) return "pick a launchpad";
			const fee = state.launchpad.feeConfig;
			if (!fee) return "configure launchpad fees";
			if (fee.kind === "four-meme-tax") {
				const sum =
					fee.allocation.founderBps + fee.allocation.holderBps + fee.allocation.burnBps + fee.allocation.liquidityBps;
				const expected = 10_000 - fee.platformCutBps;
				if (sum !== expected) return `allocations must sum to ${(expected / 100).toFixed(2)}%`;
			}
			if (fee.kind === "flap" && fee.recipient === "custom-vault") {
				if (!/^0x[a-fA-F0-9]{40}$/.test(fee.customVaultAddress?.trim() ?? "")) {
					return "vault address must be a valid 0x address";
				}
			}
			return null;
		}
		case "runtime": {
			if (state.runtime.kind === "webhook") {
				const url = state.runtime.webhookUrl.trim();
				if (!url) return "webhook url required";
				try {
					const u = new URL(url);
					if (u.protocol !== "https:" && u.protocol !== "http:") return "url must be http(s)";
				} catch {
					return "invalid url";
				}
			}
			return null;
		}
		case "safe":
			return null;
		case "review":
			return null;
		default:
			return null;
	}
}

export function useStepValid(step: WizardStep): { valid: boolean; reason: string | null } {
	const { state } = useWizard();
	const reason = validateStep(step, state);
	return { valid: reason === null, reason };
}
