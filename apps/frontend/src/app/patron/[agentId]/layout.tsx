import type { ReactNode } from "react";

export async function generateStaticParams() {
	const { isStaticExport, fetchPatronAgentParamsForStaticExport } = await import("@/lib/static-export-paths");
	if (!isStaticExport()) return [];
	return fetchPatronAgentParamsForStaticExport();
}

export default function PatronAgentSegmentLayout({ children }: { children: ReactNode }) {
	return children;
}
