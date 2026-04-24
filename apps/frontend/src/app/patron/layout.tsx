import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Patron",
	description: "Manage the agents you've launched.",
};

export default function PatronLayout({ children }: { children: ReactNode }) {
	return <section className="max-w-6xl mx-auto w-full">{children}</section>;
}
