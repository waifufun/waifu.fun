/**
 * Schema-driven action form for a capability.
 *
 * Renders a `CapabilityActionDescriptor`'s `inputs[]` as form fields purely
 * from the schema (no per-action code), shows a "requires consent" indicator
 * when `requiresConsent`, and surfaces a CTA that is DELIBERATELY not wired to
 * execution yet. The generic action-execution route is deferred (see #998 /
 * AGENT-PRIMITIVES-ARCH §3.5), so:
 *
 *   - read-mode actions never exist as forms (data views cover reads).
 *   - every write action renders its form + a disabled / "coming soon" CTA.
 *   - if the descriptor has no endpoint (planned capability), the CTA is locked.
 *
 * Local form state is kept so the shape is real and reviewable, but nothing is
 * POSTed. When the execution route lands, only the CTA handler changes.
 *
 * Copy is lowercase, no em-dashes, Wave T accent.
 */

"use client";

import { useState } from "react";

import { StatPill } from "@/components/agent-home/wave-t/_primitives";
import type { CapabilityActionDescriptor, CapabilityActionField } from "@/lib/api/capabilities";
import { cn } from "@/lib/utils";

const INPUT_CLS =
	"w-full rounded-sm border border-[var(--border-mid)] bg-black/30 px-2.5 py-1.5 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]/40 focus:outline-none";

function Field({
	field,
	value,
	onChange,
}: {
	field: CapabilityActionField;
	value: string;
	onChange: (next: string) => void;
}) {
	const id = `cap-field-${field.name}`;
	const common = {
		id,
		value,
		placeholder: field.placeholder ?? "",
		onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(e.target.value),
		className: INPUT_CLS,
	};

	const control = (() => {
		switch (field.type) {
			case "select":
			case "chain-select":
			case "token-select":
				return (
					<select {...common}>
						<option value="">{field.placeholder ?? "select..."}</option>
						{(field.options ?? []).map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				);
			case "boolean":
				return (
					<select {...common}>
						<option value="">select...</option>
						<option value="true">true</option>
						<option value="false">false</option>
					</select>
				);
			case "amount":
			case "number":
				return <input type="text" inputMode="decimal" {...common} />;
			default:
				return <input type="text" {...common} />;
		}
	})();

	return (
		<label htmlFor={id} className="flex flex-col gap-1">
			<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				{field.label}
				{field.required ? <span className="ml-1 text-[var(--accent)]">*</span> : null}
			</span>
			{control}
			{field.help ? <span className="font-mono text-[9px] text-[var(--text-tertiary)]">{field.help}</span> : null}
		</label>
	);
}

const MODE_LABEL: Record<CapabilityActionDescriptor["mode"], string> = {
	read: "read",
	prepare_tx: "prepares tx",
	client_signed: "you sign",
	agent_signed: "agent signs",
	server_job: "queued",
};

export function CapabilityActionForm({
	action,
	locked,
}: {
	action: CapabilityActionDescriptor;
	/** Capability is planned/locked, or has no execution endpoint. */
	locked: boolean;
}) {
	const [values, setValues] = useState<Record<string, string>>({});
	const setField = (name: string, next: string) => setValues((prev) => ({ ...prev, [name]: next }));

	const noEndpoint = !action.endpoint;
	const disabled = locked || noEndpoint;

	return (
		<div className="rounded-sm border border-[var(--border-soft)] bg-white/[0.015] p-3">
			<div className="mb-2 flex items-start justify-between gap-2">
				<div>
					<p className="font-mono text-[12px] text-[var(--text-primary)]">{action.label}</p>
					<p className="mt-0.5 max-w-[60ch] text-[11px] leading-relaxed text-[var(--text-secondary)]">
						{action.description}
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					<StatPill tone="neutral">{MODE_LABEL[action.mode]}</StatPill>
					{action.requiresConsent ? <StatPill tone="accent">requires consent</StatPill> : null}
				</div>
			</div>

			{action.inputs.length > 0 ? (
				<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
					{action.inputs.map((field) => (
						<Field
							key={field.name}
							field={field}
							value={values[field.name] ?? ""}
							onChange={(v) => setField(field.name, v)}
						/>
					))}
				</div>
			) : null}

			<div className="mt-3 flex items-center gap-2">
				<button
					type="button"
					disabled={disabled}
					aria-disabled={disabled}
					className={cn(
						"inline-flex items-center border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
						disabled
							? "cursor-not-allowed border-[var(--border-mid)] text-[var(--text-tertiary)]"
							: "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)]/15",
					)}
				>
					{action.label}
				</button>
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					{noEndpoint ? "not yet available" : "execution coming soon"}
				</span>
			</div>
		</div>
	);
}
