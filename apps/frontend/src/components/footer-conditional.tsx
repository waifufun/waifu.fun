"use client";

import { usePathname } from "next/navigation";
import Footer from "./footer";

/** Renders Footer on all routes except token pages and litepaper. */
export default function FooterConditional() {
	const pathname = usePathname();
	const isTokenPage = pathname?.startsWith("/token/");
	const isLitepaper = pathname === "/litepaper" || pathname?.startsWith("/litepaper/");
	const isStewardCallback = pathname?.startsWith("/auth/steward/");
	if (isTokenPage || isLitepaper || isStewardCallback) return null;
	return <Footer />;
}
