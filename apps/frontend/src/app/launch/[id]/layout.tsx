import type { ReactNode } from "react";

/**
 * W48: `/launch/[id]` is a client-side page that polls launch state via
 * `useLaunchState`. We're on `output: "export"` so we need a non-empty
 * `generateStaticParams`. A single placeholder param is enough; real ids
 * resolve at runtime, the page reads them via `useParams`.
 */
export async function generateStaticParams() {
	return [{ id: "placeholder" }];
}

export default function LaunchSegmentLayout({ children }: { children: ReactNode }) {
	return children;
}
