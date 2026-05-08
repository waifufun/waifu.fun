import LaunchPageClient from "./launch-page-client";

/**
 * `output: "export"` requires `generateStaticParams` to enumerate every
 * dynamic route at build time. The launch round page is fully client-driven
 * (wagmi reads + react-query off the public API), so we only emit a single
 * placeholder shell. Live launch ids resolve at runtime via client-side
 * fetch (Cloudflare Pages serves the same shell HTML for any `/launch/<id>`);
 * unknown ids show the not-found state inside the client component.
 *
 * `dynamicParams` is intentionally omitted: `output: "export"` rejects
 * `dynamicParams: true`, and the default (false) is fine because the
 * placeholder-only export still loads on every path via the SPA shell once
 * Cloudflare Pages serves it from the catch-all.
 */
export function generateStaticParams() {
	return [{ id: "_" }];
}

export default async function LaunchRoundPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <LaunchPageClient id={id} />;
}
