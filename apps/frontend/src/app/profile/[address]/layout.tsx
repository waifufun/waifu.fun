import type { ReactNode } from "react";

export async function generateStaticParams() {
	const { isStaticExport, fetchProfileAddressesForStaticExport } = await import("@/lib/static-export-paths");
	if (!isStaticExport()) return [];
	return fetchProfileAddressesForStaticExport();
}

export default function ProfileAddressLayout({ children }: { children: ReactNode }) {
	return children;
}
