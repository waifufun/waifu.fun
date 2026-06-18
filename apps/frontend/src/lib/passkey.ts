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
import { sanitizeRedirectPath } from "./url-safety";

const STEWARD_BASE = process.env.NEXT_PUBLIC_STEWARD_URL ?? "https://eliza.steward.fi";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";
const TENANT = process.env.NEXT_PUBLIC_STEWARD_TENANT_ID ?? "waifu";

const PLATFORM_AUTHENTICATOR_ATTACHMENT = "platform" as const;
const PLATFORM_HINT = "client-device" as const;

type ClientDeviceHint = typeof PLATFORM_HINT;
type CredentialHint = ClientDeviceHint | "security-key" | "hybrid";
type PasskeyRequestOptionsWithHints = PublicKeyCredentialRequestOptionsJSON & { hints?: CredentialHint[] };
type PasskeyCreationOptionsWithHints = PublicKeyCredentialCreationOptionsJSON & { hints?: CredentialHint[] };

export class PasskeyError extends Error {
	readonly code:
		| "USER_CANCELLED"
		| "NOT_SUPPORTED"
		| "NO_PASSKEY"
		| "NO_LOCAL_CREDENTIAL"
		| "RATE_LIMITED"
		| "AUTH_FAILED"
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
	// POST to SAME-ORIGIN /api/auth/finalize Next.js route which proxies to
	// api.waifu.fun and mirrors Set-Cookie back as a first-party cookie.
	// Avoids cross-origin cookie storage failures in Safari ITP / strict
	// browser modes.
	const res = await fetch("/api/auth/finalize", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ provider: "passkey", token, email, return_to: returnTo }),
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
		throw new PasskeyError("STEWARD_ERROR", body?.message ?? body?.error ?? `finalize failed (http ${res.status})`);
	}
	const json = (await res.json()) as {
		ok: boolean;
		data: { return_to: string };
	};
	return sanitizeRedirectPath(json?.data?.return_to);
}

function withClientDeviceHint<T extends { hints?: CredentialHint[] }>(options: T): T {
	const hints = options.hints ?? [];
	const withoutPlatform = hints.filter((hint) => hint !== PLATFORM_HINT);
	return { ...options, hints: [PLATFORM_HINT, ...withoutPlatform] };
}

export function preparePasskeyLoginOptions(
	options: PublicKeyCredentialRequestOptionsJSON,
): PasskeyRequestOptionsWithHints {
	// Defense in depth for the QR regression fixed in waifu PRs #412, #414, and #431:
	// ask Steward for platform credentials, then also force the browser-side
	// optionsJSON to prefer the local device. Steward currently preserves
	// authenticatorAttachment for registration but can drop hints, so do this
	// after the options response, immediately before startAuthentication().
	return {
		...withClientDeviceHint(options as PasskeyRequestOptionsWithHints),
		userVerification: "preferred",
	};
}

export function preparePasskeyRegistrationOptions(
	options: PublicKeyCredentialCreationOptionsJSON,
): PasskeyCreationOptionsWithHints {
	const next = withClientDeviceHint(options as PasskeyCreationOptionsWithHints);
	return {
		...next,
		authenticatorSelection: {
			...next.authenticatorSelection,
			authenticatorAttachment: PLATFORM_AUTHENTICATOR_ATTACHMENT,
			residentKey: "preferred",
			userVerification: "preferred",
		},
	};
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
			// Steward's one-time WebAuthn challenge handle. login/verify REQUIRES
			// it back (it keys the server-side challenge store).
			challengeId?: string;
		} & PublicKeyCredentialRequestOptionsJSON
	>("/auth/passkey/login/options", {
		email,
		authenticatorAttachment: PLATFORM_AUTHENTICATOR_ATTACHMENT,
		hints: [PLATFORM_HINT],
	});

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
	// (<800ms), it's almost always "no matching local credential": the
	// browser couldn't satisfy the allowCredentials list because the user's
	// device doesn't have any of the registered passkeys locally (e.g.
	// they registered on a different device + iCloud sync isn't carrying
	// the credential here). When that happens we surface NO_LOCAL_CREDENTIAL
	// so the caller can fall through to register a NEW passkey on this
	// device, instead of treating it as a user cancellation.
	const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
	let assertion: Awaited<ReturnType<typeof startAuthentication>>;
	try {
		assertion = await startAuthentication({ optionsJSON: preparePasskeyLoginOptions(optionsRes.body) });
	} catch (err) {
		if (isCancelled(err)) {
			const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
			if (elapsedMs < 800) {
				throw new PasskeyError("NO_LOCAL_CREDENTIAL", "no passkey for this site is on this device");
			}
			throw new PasskeyError("USER_CANCELLED", "passkey prompt cancelled");
		}
		throw new PasskeyError("UNKNOWN", err instanceof Error ? err.message : "passkey failed");
	}

	const challengeId = optionsRes.body.challengeId;
	if (!challengeId) {
		throw new PasskeyError("STEWARD_ERROR", "passkey login options did not include a challengeId");
	}

	const verifyRes = await postSteward<{
		ok?: boolean;
		token?: string;
		refreshToken?: string;
		error?: string;
		message?: string;
	}>("/auth/passkey/login/verify", { email, response: assertion, challengeId });

	if (verifyRes.status >= 400 || !verifyRes.body || !verifyRes.body.token) {
		// 401 here usually means the credential can't be verified for THIS
		// site — most commonly a passkey registered under a different rpID
		// (e.g. created on elizacloud.ai, presented on waifu.fun). WebAuthn
		// scopes credentials to the domain, so the right UX is a graceful
		// fallback (magic link + offer to create a fresh passkey here), not a
		// dead-end error.
		if (verifyRes.status === 401) {
			throw new PasskeyError(
				"AUTH_FAILED",
				verifyRes.body?.message ?? verifyRes.body?.error ?? "passkey verification failed",
			);
		}
		throw new PasskeyError(
			"STEWARD_ERROR",
			verifyRes.body?.message ?? verifyRes.body?.error ?? "passkey verification failed",
		);
	}

	return finalizeWithBackend(verifyRes.body.token, email, returnTo);
}

/**
 * OTP helpers (Privy-style verified signup).
 *
 * sendOtpCode  — POST /auth/email/otp/send: emails a 6-digit code.
 * verifyOtpCode — POST /auth/email/otp/verify: exchanges the code for a
 *   short-lived single-use verified-email GRANT, which registerPasskey can
 *   pass to Steward so a brand-new user can register WITHOUT a session.
 */
export async function sendOtpCode(email: string): Promise<void> {
	const res = await postSteward<{ ok?: boolean; error?: string; message?: string }>("/auth/email/otp/send", { email });
	if (res.status === 429) {
		throw new PasskeyError("RATE_LIMITED", "too many codes requested, wait a minute");
	}
	if (res.status >= 400) {
		throw new PasskeyError("STEWARD_ERROR", res.body?.message ?? res.body?.error ?? "could not send the code");
	}
}

export async function verifyOtpCode(email: string, code: string): Promise<string> {
	const res = await postSteward<{
		ok?: boolean;
		data?: { emailGrant?: string };
		error?: string;
		message?: string;
	}>("/auth/email/otp/verify", { email, code });
	if (res.status === 429) {
		throw new PasskeyError("RATE_LIMITED", "too many attempts, wait a few minutes");
	}
	const grant = res.body?.data?.emailGrant;
	if (res.status >= 400 || !grant) {
		throw new PasskeyError("AUTH_FAILED", res.body?.message ?? res.body?.error ?? "wrong or expired code");
	}
	return grant;
}

/**
 * Register a new passkey for the given email. Returns the redirect path on success.
 * Throws PasskeyError on failure or cancellation.
 *
 * `emailGrant` (from verifyOtpCode) lets a signed-out user register: Steward
 * accepts the grant as proof of email ownership in place of a session.
 */
export async function registerPasskey(email: string, returnTo?: string, emailGrant?: string): Promise<string> {
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
		authenticatorAttachment: PLATFORM_AUTHENTICATOR_ATTACHMENT,
		hints: [PLATFORM_HINT],
		...(emailGrant ? { emailGrant } : {}),
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
		attestation = await startRegistration({ optionsJSON: preparePasskeyRegistrationOptions(optionsRes.body) });
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
	}>("/auth/passkey/register/verify", {
		email,
		response: attestation,
		...(emailGrant ? { emailGrant } : {}),
	});

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
			// No registered passkey at all for this email: register one.
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
