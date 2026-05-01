import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Envelope {
	keyRef: string;
	iv: string;
	data: string;
	tag: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function parseKeyHex(keyRef: string, value: string | undefined): Buffer {
	if (!value) {
		throw new Error(`Missing X token KEK for keyRef '${keyRef}'`);
	}

	const key = Buffer.from(value, "hex");
	if (key.length !== KEY_BYTES || key.toString("hex") !== value.toLowerCase()) {
		throw new Error(`Invalid X token KEK '${keyRef}': expected ${KEY_BYTES} bytes of hex`);
	}

	return key;
}

function parseKekMap(): Map<string, Buffer> {
	const keyedEnv = process.env.X_TOKEN_KEKS_HEX;
	if (keyedEnv && keyedEnv.trim().length > 0) {
		const map = new Map<string, Buffer>();
		for (const entry of keyedEnv.split(",")) {
			const trimmed = entry.trim();
			if (!trimmed) continue;
			const separator = trimmed.indexOf("=");
			if (separator <= 0) {
				throw new Error("Invalid X_TOKEN_KEKS_HEX entry; expected keyRef=<64 hex chars>");
			}
			const keyRef = trimmed.slice(0, separator).trim();
			const hex = trimmed.slice(separator + 1).trim();
			map.set(keyRef, parseKeyHex(keyRef, hex));
		}
		if (map.size === 0) {
			throw new Error("X_TOKEN_KEKS_HEX did not contain any usable KEKs");
		}
		return map;
	}

	return new Map([["default", parseKeyHex("default", process.env.X_TOKEN_KEK_HEX)]]);
}

function getActiveKey(): { keyRef: string; key: Buffer } {
	const keys = parseKekMap();
	const keyRef = process.env.X_TOKEN_KEKS_HEX ? process.env.X_TOKEN_KEK_ACTIVE : "default";

	if (!keyRef) {
		throw new Error("X_TOKEN_KEK_ACTIVE is required when X_TOKEN_KEKS_HEX is set");
	}

	const key = keys.get(keyRef);
	if (!key) {
		throw new Error(`Active X token KEK '${keyRef}' is not configured`);
	}

	return { keyRef, key };
}

function getKeyForEnvelope(keyRef: string): Buffer {
	const key = parseKekMap().get(keyRef);
	if (!key) {
		throw new Error(`X token KEK '${keyRef}' is not configured`);
	}
	return key;
}

export function encryptEnvelope(plaintext: string): Envelope {
	const { keyRef, key } = getActiveKey();
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
	const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();

	return {
		keyRef,
		iv: iv.toString("base64url"),
		data: data.toString("base64url"),
		tag: tag.toString("base64url"),
	};
}

export function decryptEnvelope(envelope: Envelope): string {
	const key = getKeyForEnvelope(envelope.keyRef);
	const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, "base64url"), {
		authTagLength: TAG_BYTES,
	});
	decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
	const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64url")), decipher.final()]);

	return plaintext.toString("utf8");
}
