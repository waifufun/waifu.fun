import * as jose from "jose";

// ─── Steward JWT verification ──────────────────────────────────────

export interface StewardAuthPrincipal {
	userId: string;
	tenantId: string;
	email?: string | undefined;
	address?: string | undefined;
}

const STEWARD_ISSUER = "steward";
const EXPECTED_TENANT = () => process.env.STEWARD_TENANT_ID ?? "waifu";

function getStewardSecret(): Uint8Array | null {
	const secret = process.env.STEWARD_JWT_SECRET;
	if (!secret || secret.length < 32) return null;
	return new TextEncoder().encode(secret);
}

export function hasStewardAuth(): boolean {
	return getStewardSecret() !== null;
}

/**
 * Verify a Steward-issued HS256 JWT.
 * Returns the decoded principal if valid, null otherwise.
 */
export async function verifyStewardJwt(token: string): Promise<StewardAuthPrincipal | null> {
	const secret = getStewardSecret();
	if (!secret) return null;

	try {
		const { payload } = await jose.jwtVerify(token, secret, {
			issuer: STEWARD_ISSUER,
		});

		const userId = payload.userId ?? payload.sub;
		const tenantId = payload.tenantId;

		if (typeof userId !== "string" || typeof tenantId !== "string") {
			return null;
		}

		// Reject tokens not issued for our tenant
		if (tenantId !== EXPECTED_TENANT()) {
			return null;
		}

		return {
			userId: userId as string,
			tenantId: tenantId as string,
			email: typeof payload.email === "string" ? payload.email : undefined,
			address: typeof payload.address === "string" ? payload.address : undefined,
		};
	} catch {
		return null;
	}
}
