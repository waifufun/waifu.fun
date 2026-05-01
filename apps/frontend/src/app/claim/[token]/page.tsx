import ClaimTokenClient from "./claim-token-client";
import { isStaticExport, parseClaimTokensFromEnv } from "@/lib/static-export-paths";

export async function generateStaticParams() {
	if (!isStaticExport()) return [];
	const tokens = parseClaimTokensFromEnv();
	// Next static export requires at least one param combination; "_" shells show client not-found.
	return tokens.length > 0 ? tokens : [{ token: "_" }];
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	return <ClaimTokenClient token={token} />;
}
