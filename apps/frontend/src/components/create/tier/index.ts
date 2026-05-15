/**
 * W48: Launch Wizard component barrel.
 *
 * Spec-named components map to existing wizard internals:
 *   - WizardProgress  → re-export of `useWizardStep` (real UI in wizard-shell)
 *   - IdentityStep    → existing `step-persona.tsx`
 *   - TierStep        → `step-tier.tsx`
 *   - TierCard        → `tier-card.tsx`
 *   - EconomicsPreview→ `economics-preview.tsx`
 *   - ReviewStep      → existing `step-review.tsx`
 *   - SubmitButton    → `submit-button.tsx`
 */
export { default as IdentityStep } from "../step-persona";
export { default as ReviewStep } from "../step-review";
export { default as TierStep } from "./step-tier";
export { TierCard } from "./tier-card";
export { EconomicsPreview } from "./economics-preview";
export { SubmitButton } from "./submit-button";
export { WizardProgress } from "./wizard-progress";
export { TIERS, type TierId, type TierPreset, getTier, totalBnb } from "./tier-data";
