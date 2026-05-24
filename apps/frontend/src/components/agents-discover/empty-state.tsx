// Thin wrapper kept for backwards-compat. The canonical primitive lives at
// `@/components/ui/empty-state` and we re-export it here so existing imports
// (`@/components/agents-discover/empty-state`) keep working while migration
// happens incrementally.
"use client";

import { EmptyState as UiEmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/contexts/locale-context";

export default function EmptyState({
	title,
	subtitle,
	ctaHref = "/agents",
	ctaLabel,
}: {
	title?: string;
	subtitle?: string;
	ctaHref?: string;
	ctaLabel?: string;
}) {
	const { t } = useTranslation();
	return (
		<UiEmptyState
			title={title ?? t("discover.agents.emptyTitle")}
			body={subtitle ?? t("discover.agents.emptyBody")}
			ctaHref={ctaHref}
			ctaLabel={ctaLabel ?? t("discover.agents.browseCta")}
		/>
	);
}
