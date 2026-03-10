"use client";

import { PromptProvider } from "@/components/hooks/providers/usePromptContext";
import { DraftProvider } from "./draft-context";
import { WizardShell } from "./wizard-shell";

/**
 * /create - WaifuDraft-driven 6-step wizard.
 *
 * Both "create new" and "import existing" flow through the same wizard:
 *   1. Entry - choose mode
 *   2. Identity - name / ticker / description / image
 *   3. Token & Provenance - vanity address / curve / pool (create) or CA input (import)
 *   4. Runtime - delayed start / trade limits (create) or agent config placeholder (import)
 *   5. Owner & Billing - pre-buy / wallet (create) or billing placeholder (import)
 *   6. Review & Activate - summary + launch / import
 *
 * DraftProvider owns wizard flow state (step, mode).
 * PromptProvider owns form fields, media generation, and vanity address workers.
 */
export default function CreateTokenPage() {
	return (
		<DraftProvider>
			<PromptProvider>
				<div className="w-full max-w-6xl mx-auto px-4 py-8">
					<WizardShell />
				</div>
			</PromptProvider>
		</DraftProvider>
	);
}
