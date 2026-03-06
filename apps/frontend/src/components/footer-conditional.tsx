"use client";

import { usePathname } from "next/navigation";
import Footer from "./footer";

/** Renders Footer on all routes except token pages (e.g. /token/...). */
export default function FooterConditional() {
	const pathname = usePathname();
	const isTokenPage = pathname?.startsWith("/token/");
	if (isTokenPage) return null;
	return <Footer />;
}
