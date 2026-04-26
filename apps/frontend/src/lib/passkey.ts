/**
 * Passkey (WebAuthn) helpers (W9.12).
 *
 * The browser drives the WebAuthn dance directly with Steward
 * (eliza.steward.fi/auth/passkey/{login,register}/{options,verify}). Once
 * Steward returns a session token, the browser POSTs it to our own
 * /auth/passkey/finalize on api.waifu.fun so we can mint the wf_session
 * cookie and provision the patron row.
 */

import {
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";

const STEWARD_BASE = process.env.NEXT_PUBLIC_STEWARD_URL ?? "https://eliza.steward.fi";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";
const TENANT = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID ?? "waifu";

export class PasskeyError extends Error {
	readonly code:
		| "USER_CANCELLED"
		| "NOT_SUPPORTED"
		| "NO_PASSKEY"
		| "NO_LOCAL_CREDENTIAL"
		| "RATE_LIMITED"
		| "STEWARD_ERROR"
		| "UNKNOWN";
	constructor(code: PasskeyError["code"], message: string) {
		super(message);
		this.code = code;
	}
}

function isCancelled(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return err.name === "NotAllowedError" || err.name === "AbortError";
}

async function postSteward<T>(path: string, body: unknown): Promise<{ status: number; body: T | null }> {
	const res = await fetch(`${STEWARD_BASE}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Steward-Tenant": TENANT,
		},
		body: JSON.stringify({ ...(body as object), tenantId: TENANT }),
	});
	let json: T | null = null;
	try {
		json = (await res.json()) as T;
	} catch {
		json = null;
	}
	return { status: res.status, body: json };
}

async function finalizeWithBackend(token: string, email: string, returnTo?: string): Promise<string> {
	const res = await fetch(`${API_URL}/auth/passkey/finalize`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token, email, return_to: returnTo }),
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
		throw new PasskeyError("STEWARD_ERROR", body?.message ?? body?.error ?? `finalize failed (http ${res.status})`);
	}
	const json = (await res.json()) as {
		ok: boolean;
		data: { return_to: string };
	};
	return json?.data?.return_to ?? "/patron";
}

/**
 * Try to log in with a passkey for the given email. Returns the redirect path on success.
 * Throws PasskeyError on failure or cancellation.
 */
export async function loginWithPasskey(email: string, returnTo?: string): Promise<string> {
	if (typeof window === "undefined" || !window.PublicKeyCredential) {
		throw new PasskeyError("NOT_SUPPORTED", "your browser does not support passkeys");
	}

	const optionsRes = await postSteward<
		{
			ok?: boolean;
			error?: string;
			message?: string;
		} & PublicKeyCredentialRequestOptionsJSON
	>("/auth/passkey/login/options", { email });

	if (optionsRes.status === 404) {
		throw new PasskeyError("NO_PASSKEY", "no passkey found for that email");
	}
	if (optionsRes.status === 429) {
		throw new PasskeyError("RATE_LIMITED", "too many requests, try again in a minute");
	}
	if (optionsRes.status >= 400 || !optionsRes.body) {
		throw new PasskeyError(
			"STEWARD_ERROR",
			optionsRes.body?.message ?? optionsRes.body?.error ?? "could not start passkey login",
		);
	}

	// Track how long the prompt was open. If WebAuthn errors out very fast
	// (<800ms), it's almost always "no matching local credential" — the
	// browser couldn't satisfy the allowCredentials list because the user's
	// device doesn't have any of the registered passkeys locally (e.g.
	// they registered on a different device + iCloud sync isn't carrying
	// the credential here). When that happens we surface NO_LOCAL_CREDENTIAL
	// so the caller can fall through to register a NEW passkey on this
	// device, instead of treating it as a user cancellation.
	const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
	let assertion: Awaited<ReturnType<typeof startAuthentication>>;
	try {
		assertion = await startAuthentication({ optionsJSON: optionsRes.body });
	} catch (err) {
		if (isCancelled(err)) {
			const elapsedMs =
				(typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
			if (elapsedMs < 800) {
				throw new PasskeyError(
					"NO_LOCAL_CREDENTIAL",
					"no passkey for this site is on this device",
				);
			}
			throw new PasskeyError("USER_CANCELLED", "passkey prompt cancelled");
		}
		throw new PasskeyError("UNKNOWN", err instanceof Error ? err.message : "passkey failed");
	}

	const verifyRes = await postSteward<{
		ok?: boolean;
		token?: string;
		refreshToken?: string;
		error?: string;
		message?: string;
	}>("/auth/passkey/login/verify", { email, response: assertion });

	if (verifyRes.status >= 400 || !verifyRes.body || !verifyRes.body.token) {
		throw new PasskeyError(
			"STEWARD_ERROR",
			verifyRes.body?.message ?? verifyRes.body?.error ?? "passkey verification failed",
		);
	}

	return finalizeWithBackend(verifyRes.body.token, email, returnTo);
}

/**
 * Register a new passkey for the given email. Returns the redirect path on success.
 * Throws PasskeyError on failure or cancellation.
 */
export async function registerPasskey(email: string, returnTo?: string): Promise<string> {
	if (typeof window === "undefined" || !window.PublicKeyCredential) {
		throw new PasskeyError("NOT_SUPPORTED", "your browser does not support passkeys");
	}

	const optionsRes = await postSteward<
		{
			ok?: boolean;
			error?: string;
			message?: string;
		} & PublicKeyCredentialCreationOptionsJSON
	>("/auth/passkey/register/options", {
		email,
		// Hint to Steward + browser: prefer the platform authenticator
		// (Touch ID / Face ID / Windows Hello) over the QR/security-key
		// picker. Requires Steward >= 0.3.6 (PR #30).
		authenticatorAttachment: "platform",
	});

	if (optionsRes.status === 429) {
		throw new PasskeyError("RATE_LIMITED", "too many requests, try again in a minute");
	}
	if (optionsRes.status >= 400 || !optionsRes.body) {
		throw new PasskeyError(
			"STEWARD_ERROR",
			optionsRes.body?.message ?? optionsRes.body?.error ?? "could not start passkey registration",
		);
	}

	let attestation: Awaited<ReturnType<typeof startRegistration>>;
	try {
		attestation = await startRegistration({ optionsJSON: optionsRes.body });
	} catch (err) {
		if (isCancelled(err)) {
			throw new PasskeyError("USER_CANCELLED", "passkey prompt cancelled");
		}
		throw new PasskeyError("UNKNOWN", err instanceof Error ? err.message : "passkey failed");
	}

	const verifyRes = await postSteward<{
		ok?: boolean;
		token?: string;
		refreshToken?: string;
		error?: string;
		message?: string;
	}>("/auth/passkey/register/verify", { email, response: attestation });

	if (verifyRes.status >= 400 || !verifyRes.body || !verifyRes.body.token) {
		throw new PasskeyError(
			"STEWARD_ERROR",
			verifyRes.body?.message ?? verifyRes.body?.error ?? "passkey registration failed",
		);
	}

	return finalizeWithBackend(verifyRes.body.token, email, returnTo);
}

/**
 * Try login first; if no passkey exists for the email, fall through to
 * registration. This mirrors the "smart" passkey behavior most consumer
 * auth UIs ship.
 */
export async function loginOrRegisterPasskey(email: string, returnTo?: string): Promise<string> {
	try {
		return await loginWithPasskey(email, returnTo);
	} catch (err) {
		if (err instanceof PasskeyError) {
			// No registered passkey at all for this email — register one.
			if (err.code === "NO_PASSKEY") {
				return registerPasskey(email, returnTo);
			}
			// User HAS a passkey registered (probably on a different device)
			// but this device has no local credential matching the allowList.
			// Register a NEW passkey for this device. Steward stores multiple
			// authenticators per user, so this is the right move.
			if (err.code === "NO_LOCAL_CREDENTIAL") {
				return registerPasskey(email, returnTo);
			}
		}
		throw err;
	}
}
