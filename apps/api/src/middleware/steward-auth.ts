import * as jose from "jose";

// ─── Steward JWT verification ──────────────────────────────────────

export interface StewardJwtWallet {
	chainNamespace: string;
	address: string;
}

export interface StewardAuthPrincipal {
	userId: string;
	tenantId: string;
	email?: string | undefined;
	address?: string | undefined;
	authMethod?: string | undefined;
	wallets?: StewardJwtWallet[] | undefined;
}

const STEWARD_ISSUER = "steward";
const EXPECTED_TENANT = () => process.env.STEWARD_TENANT_ID ?? "waifu";

function parseWallets(value: unknown): StewardJwtWallet[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const wallets = value
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const wallet = item as Record<string, unknown>;
			const chainNamespace = wallet.chainNamespace ?? wallet.chain_namespace ?? wallet.namespace ?? wallet.chain;
			const address = wallet.address ?? wallet.walletAddress ?? wallet.wallet_address;
			if (typeof chainNamespace !== "string" || typeof address !== "string") return null;
			return { chainNamespace, address };
		})
		.filter((wallet): wallet is StewardJwtWallet => wallet !== null);
	return wallets.length > 0 ? wallets : undefined;
}

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
		const tenantId = payload.tenantId ?? payload.tenant_id;

		if (typeof userId !== "string" || typeof tenantId !== "string") {
			return null;
		}

		if (tenantId !== EXPECTED_TENANT()) {
			return null;
		}

		return {
			userId: userId as string,
			tenantId: tenantId as string,
			email: typeof payload.email === "string" ? payload.email : undefined,
			address:
				typeof payload.address === "string"
					? payload.address
					: typeof payload.walletAddress === "string"
						? payload.walletAddress
						: undefined,
			authMethod:
				typeof payload.auth_method === "string"
					? payload.auth_method
					: typeof payload.authMethod === "string"
						? payload.authMethod
						: undefined,
			wallets: parseWallets(payload.wallets),
		};
	} catch {
		return null;
	}
}
