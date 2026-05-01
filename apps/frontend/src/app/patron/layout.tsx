import { ProtectedShell } from "@/components/auth/protected-shell";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "patron",
	description: "manage the agents you've launched.",
};

export default function PatronLayout({ children }: { children: ReactNode }) {
	return (
		<ProtectedShell>
			<section className="max-w-6xl mx-auto w-full">{children}</section>
		</ProtectedShell>
	);
}
