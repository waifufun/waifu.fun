import { type NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

function sanitizeReturnTo(raw: string | null): string {
	if (!raw || raw.length > 200) return "/patron";
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/patron";
	return raw;
}

export function GET(req: NextRequest) {
	const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("return_to"));
	const upstream = new URL("/auth/twitter/login", API_URL);
	upstream.searchParams.set("return_to", returnTo);
	return NextResponse.redirect(upstream, 302);
}
