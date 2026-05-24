"use client";

import type { ChainId, LaunchpadFeeConfig, LaunchpadId } from "@/lib/launchpad/types";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";

/**
 * Feature flag controlling the launchpad picker step.
 * Default: off. When off, wizard runs the legacy four.meme-only flow.
 * W2.B handles the full cutover.
 */
export const LAUNCHPAD_PICKER_ENABLED = process.env.NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED === "true";

/**
 * Wave M tax + safe defaults.
 *
 * The platform receiver is the operator-controlled Safe that captures the
 * platform tax share. We hardcode a burner placeholder for local dev and
 * accept `NEXT_PUBLIC_PLATFORM_SAFE_ADDRESS` as the production override.
 *
 * The bps splits are intentionally locked here. Shadow spec calls for a
 * 10% platform / 25% patron / 65% agent split; we let env overrides exist
 * so we can rebalance without a redeploy, but the wizard UI does not let
 * end users change these.
 */
function parseEnvBps(raw: string | undefined, fallback: number): number {
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000) return fallback;
	return Math.round(parsed);
}

const BURNER_PLATFORM_RECEIVER = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";
export const PLATFORM_RECEIVER_DEFAULT =
	process.env.NEXT_PUBLIC_PLATFORM_SAFE_ADDRESS &&
	/^0x[a-fA-F0-9]{40}$/.test(process.env.NEXT_PUBLIC_PLATFORM_SAFE_ADDRESS)
		? process.env.NEXT_PUBLIC_PLATFORM_SAFE_ADDRESS
		: BURNER_PLATFORM_RECEIVER;
export const PLATFORM_BPS_DEFAULT = parseEnvBps(process.env.NEXT_PUBLIC_PLATFORM_BPS, 1000);
export const PATRON_BPS_DEFAULT = parseEnvBps(process.env.NEXT_PUBLIC_PATRON_BPS, 2500);

/**
 * Wizard step identifiers. URL-synced via `?step=`.
 *
 * The wizard is the hosted Eliza Cloud path. BYO (webhook/pull) runtimes
 * are intentionally absent here; those users go through `/give-skill`
 * instead and never touch this flow.
 */
export type WizardStep = "persona" | "metadata" | "tier" | "launchpad" | "safe" | "review";

export const LEGACY_WIZARD_STEPS: WizardStep[] = ["persona", "metadata", "tier", "safe", "review"];
export const LAUNCHPAD_WIZARD_STEPS: WizardStep[] = ["persona", "metadata", "tier", "launchpad", "safe", "review"];

export const WIZARD_STEPS: WizardStep[] = LAUNCHPAD_PICKER_ENABLED ? LAUNCHPAD_WIZARD_STEPS : LEGACY_WIZARD_STEPS;

export const STEP_LABELS: Record<WizardStep, string> = {
	persona: "persona",
	metadata: "metadata",
	tier: "tier",
	launchpad: "launchpad",
	safe: "safe & policies",
	review: "review",
};

export type WizardState = {
	/**
	 * Invite code (waifu.fun is invite-only). Required to launch.
	 * Step-persona fails validity if this is empty.
	 */
	inviteCode: string;
	persona: {
		name: string;
		ticker: string;
		bio: string;
		avatarDataUrl: string | null;
		avatarTemplateId: string | null;
		personaPrompt: string;
	};
	/**
	 * Wave H token metadata. Captured before the tier step; uploaded to Flap's
	 * IPFS endpoint (`funcs.flap.sh/api/upload`) on step-complete. The returned
	 * CID is stored in `flap.metaCid` and passed as `params.meta` when the
	 * bundle router calls `Portal.newTokenV6`.
	 *
	 * `tokenImageDataUrl` is the raw image for upload, separate from the
	 * persona avatar. agents and tokens can have different visual identity,
	 * though the wizard pre-fills from the persona avatar by default.
	 */
	flap: {
		tokenImageDataUrl: string | null;
		description: string;
		twitter: string;
		telegram: string;
		website: string;
		metaCid: string | null;
		metaUri: string | null;
	};
	safe: {
		taxAgentBps: number;
		taxPatronBps: number;
		owners: string[];
		threshold: number;
		firstBuyFundingSource: string | null;
		adapters: { pancake: boolean; venus: boolean };
	};
	/**
	 * Wave M tax routing + Safe config sent in the `POST /v2/launches` body.
	 *
	 * Defaults are sourced from environment so we can adjust per-launch later
	 * without code changes. The wizard exposes a collapsed advanced panel
	 * (`patronPlatform`) where power users can audit and, eventually, override
	 * these values. Today only `agentSafeOwners` and `agentSafeThreshold`
	 * are user-editable via the safe step; the other fields are locked.
	 *
	 * Field meaning:
	 * - platformReceiver: address that receives the platform tax share.
	 * - patron: launch patron (recipient of the patron tax share).
	 * - platformBps: platform tax share in basis points (1000 = 10%).
	 * - patronBps: patron tax share in basis points (2500 = 25%).
	 * The agent gets whatever is left over (10000 - platformBps - patronBps).
	 */
	patronPlatform: {
		platformReceiver: string;
		patron: string | null;
		platformBps: number;
		patronBps: number;
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
	/**
	 * W48: launch tier selection. Drives the economics preview and the
	 * `POST /v2/launches` payload.
	 */
	launch: {
		tierId: 80 | 90 | 95 | 98 | null;
	};
	/**
	 * Vanity-address mining bookkeeping. The backend mines `0x…7777` salts
	 * asynchronously after the wizard submits. The frontend echoes the
	 * predicted address back from the launch row so review / status surfaces
	 * can show "your token: 0x…7777" while we wait.
	 */
	vanity: {
		submitted: boolean;
		predictedAddress: string | null;
	};
};

export const DEFAULT_STATE: WizardState = {
	inviteCode: "",
	persona: {
		name: "",
		ticker: "",
		bio: "",
		avatarDataUrl: null,
		avatarTemplateId: "tessera",
		personaPrompt: "",
	},
	flap: {
		tokenImageDataUrl: null,
		description: "",
		twitter: "",
		telegram: "",
		website: "",
		metaCid: null,
		metaUri: null,
	},
	safe: {
		taxAgentBps: 6500,
		taxPatronBps: 2500,
		owners: [],
		threshold: 1,
		firstBuyFundingSource: null,
		adapters: { pancake: true, venus: true },
	},
	patronPlatform: {
		platformReceiver: PLATFORM_RECEIVER_DEFAULT,
		patron: null,
		platformBps: PLATFORM_BPS_DEFAULT,
		patronBps: PATRON_BPS_DEFAULT,
	},
	launchpad: {
		selectedId: null,
		selectedChain: null,
		feeConfig: null,
	},
	launch: {
		tierId: null,
	},
	vanity: {
		submitted: false,
		predictedAddress: null,
	},
};

type Action =
	| { type: "patch_invite_code"; code: string }
	| { type: "patch_persona"; patch: Partial<WizardState["persona"]> }
	| { type: "patch_flap"; patch: Partial<WizardState["flap"]> }
	| { type: "patch_safe"; patch: Partial<WizardState["safe"]> }
	| { type: "patch_safe_adapters"; patch: Partial<WizardState["safe"]["adapters"]> }
	| { type: "patch_patron_platform"; patch: Partial<WizardState["patronPlatform"]> }
	| { type: "patch_launchpad"; patch: Partial<WizardState["launchpad"]> }
	| { type: "patch_launch"; patch: Partial<WizardState["launch"]> }
	| { type: "patch_vanity"; patch: Partial<WizardState["vanity"]> }
	| { type: "reset" }
	| { type: "hydrate"; state: WizardState };

function reducer(state: WizardState, action: Action): WizardState {
	switch (action.type) {
		case "patch_invite_code":
			return { ...state, inviteCode: action.code };
		case "patch_persona":
			return { ...state, persona: { ...state.persona, ...action.patch } };
		case "patch_flap":
			return { ...state, flap: { ...state.flap, ...action.patch } };
		case "patch_vanity":
			return { ...state, vanity: { ...state.vanity, ...action.patch } };
		case "patch_safe":
			return { ...state, safe: { ...state.safe, ...action.patch } };
		case "patch_safe_adapters":
			return { ...state, safe: { ...state.safe, adapters: { ...state.safe.adapters, ...action.patch } } };
		case "patch_patron_platform":
			return { ...state, patronPlatform: { ...state.patronPlatform, ...action.patch } };
		case "patch_launchpad":
			return { ...state, launchpad: { ...state.launchpad, ...action.patch } };
		case "patch_launch":
			return { ...state, launch: { ...state.launch, ...action.patch } };
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
	patchInviteCode: (code: string) => void;
	patchPersona: (p: Partial<WizardState["persona"]>) => void;
	patchFlap: (p: Partial<WizardState["flap"]>) => void;
	patchSafe: (p: Partial<WizardState["safe"]>) => void;
	patchAdapters: (p: Partial<WizardState["safe"]["adapters"]>) => void;
	patchPatronPlatform: (p: Partial<WizardState["patronPlatform"]>) => void;
	patchLaunchpad: (p: Partial<WizardState["launchpad"]>) => void;
	patchLaunch: (p: Partial<WizardState["launch"]>) => void;
	patchVanity: (p: Partial<WizardState["vanity"]>) => void;
	reset: () => void;
};

const WizardContext = createContext<Ctx | null>(null);

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
					inviteCode: typeof parsed.inviteCode === "string" ? parsed.inviteCode : DEFAULT_STATE.inviteCode,
					persona: { ...DEFAULT_STATE.persona, ...(parsed.persona ?? {}) },
					flap: { ...DEFAULT_STATE.flap, ...(parsed.flap ?? {}) },
					safe: {
						...DEFAULT_STATE.safe,
						...(parsed.safe ?? {}),
						adapters: { ...DEFAULT_STATE.safe.adapters, ...(parsed.safe?.adapters ?? {}) },
					},
					launchpad: { ...DEFAULT_STATE.launchpad, ...(parsed.launchpad ?? {}) },
					launch: { ...DEFAULT_STATE.launch, ...(parsed.launch ?? {}) },
					vanity: { ...DEFAULT_STATE.vanity, ...(parsed.vanity ?? {}) },
					patronPlatform: { ...DEFAULT_STATE.patronPlatform, ...(parsed.patronPlatform ?? {}) },
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
				flap: {
					...state.flap,
					// Token image data URL is large; only persist when within quota.
					tokenImageDataUrl:
						state.flap.tokenImageDataUrl && state.flap.tokenImageDataUrl.length < 250_000
							? state.flap.tokenImageDataUrl
							: null,
				},
			};
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
		} catch {
			// quota (best effort)
		}
	}, [state]);

	const value = useMemo<Ctx>(
		() => ({
			state,
			patchInviteCode: (code) => dispatch({ type: "patch_invite_code", code }),
			patchPersona: (patch) => dispatch({ type: "patch_persona", patch }),
			patchFlap: (patch) => dispatch({ type: "patch_flap", patch }),
			patchSafe: (patch) => dispatch({ type: "patch_safe", patch }),
			patchAdapters: (patch) => dispatch({ type: "patch_safe_adapters", patch }),
			patchPatronPlatform: (patch) => dispatch({ type: "patch_patron_platform", patch }),
			patchLaunchpad: (patch) => dispatch({ type: "patch_launchpad", patch }),
			patchLaunch: (patch) => dispatch({ type: "patch_launch", patch }),
			patchVanity: (patch) => dispatch({ type: "patch_vanity", patch }),
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
			// Invite code is recommended but not required at validation time.
			// Backend enforces curated-launch policy via CURATED_LAUNCH_ONLY env flag
			// + invite_codes table; frontend just collects and forwards the code.
			const { name, ticker, bio } = state.persona;
			const trimmedName = name.trim();
			const trimmedBio = bio.trim();
			if (trimmedName.length < 2) return "wizard.validation.nameLength";
			if (trimmedName.length > 48) return "wizard.validation.nameLength";
			if (!/^[A-Z0-9]{2,10}$/.test(ticker.trim())) return "wizard.validation.tickerFormat";
			if (!trimmedBio) return "wizard.validation.bioRequired";
			if (trimmedBio.length > 240) return "wizard.validation.bioTooLong";
			return null;
		}
		case "metadata": {
			const desc = state.flap.description.trim();
			if (!desc) return "wizard.validation.descriptionRequired";
			if (desc.length > 280) return "wizard.validation.descriptionTooLong";
			if (!state.flap.tokenImageDataUrl) return "wizard.validation.uploadTokenImage";
			if (!state.flap.metaCid) return "wizard.validation.uploadToFlapFirst";
			return null;
		}
		case "tier": {
			if (!state.launch.tierId) return "wizard.validation.pickTier";
			return null;
		}
		case "launchpad": {
			if (!state.launchpad.selectedId) return "wizard.validation.pickLaunchpad";
			const fee = state.launchpad.feeConfig;
			if (!fee) return "wizard.validation.configureFees";
			if (fee.kind === "four-meme-tax") {
				const sum =
					fee.allocation.founderBps + fee.allocation.holderBps + fee.allocation.burnBps + fee.allocation.liquidityBps;
				const expected = 10_000 - fee.platformCutBps;
				if (sum !== expected) return `wizard.validation.allocationsMustSum|${(expected / 100).toFixed(2)}`;
			}
			if (fee.kind === "flap" && fee.recipient === "custom-vault") {
				if (!/^0x[a-fA-F0-9]{40}$/.test(fee.customVaultAddress?.trim() ?? "")) {
					return "wizard.validation.vaultAddressInvalid";
				}
			}
			return null;
		}
		case "safe": {
			// Safe is an EVM construct. Solana-only patrons can't sign as a
			// Safe owner, so we require at least one valid EVM address before
			// the user can advance. step-safe.tsx surfaces a 'link evm wallet'
			// CTA in this state.
			const owners = state.safe.owners ?? [];
			const hasEvmOwner = owners.some((addr) => /^0x[a-fA-F0-9]{40}$/.test(addr.trim()));
			if (!hasEvmOwner) return "wizard.validation.linkEvmWallet";
			return null;
		}
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
