// Thin wrapper kept for backwards-compat. The canonical primitive lives at
// `@/components/ui/empty-state` and we re-export it here so existing imports
// (`@/components/agents-discover/empty-state`) keep working while migration
// happens incrementally.
import { EmptyState as UiEmptyState } from "@/components/ui/empty-state";

export default function EmptyState({
	title = "no agents yet.",
	subtitle = "agents launch through the api. check back soon.",
	ctaHref = "/agents",
	ctaLabel = "browse agents",
}: {
	title?: string;
	subtitle?: string;
	ctaHref?: string;
	ctaLabel?: string;
}) {
	return <UiEmptyState title={title} body={subtitle} ctaHref={ctaHref} ctaLabel={ctaLabel} />;
}
