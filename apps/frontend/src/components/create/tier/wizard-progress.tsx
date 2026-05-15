"use client";

/**
 * W48 spec calls out a `WizardProgress` component. The real progress UI
 * lives inside `wizard-shell.tsx` and is shared across every step. This
 * file is a thin re-export so the spec's component map matches and any
 * third-party imports of `WizardProgress` resolve.
 *
 * If you need the progress bar standalone (e.g. embedded in a non-wizard
 * surface), pull `useWizardStep` and the `STEP_LABELS` map directly.
 */
export { useWizardStep as WizardProgress } from "../wizard-shell";
