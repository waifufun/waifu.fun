import { type NextRequest, NextResponse } from "next/server";

import { sanitizeRedirectPath } from "@/lib/url-safety";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

export function GET(req: NextRequest) {
	const returnTo = sanitizeRedirectPath(req.nextUrl.searchParams.get("return_to"));
	const upstream = new URL("/auth/twitter/login", API_URL);
	upstream.searchParams.set("return_to", returnTo);
	return NextResponse.redirect(upstream, 302);
}
