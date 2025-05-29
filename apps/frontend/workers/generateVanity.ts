import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import * as bs58 from "bs58";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const REPORT_INTERVAL = 500;

function validateKeypair(privateKey: Uint8Array, publicKey: Uint8Array, secretKey: Uint8Array): boolean {
	try {
		const derivedPublicKey = ed.getPublicKey(privateKey);
		const publicKeyMatches = derivedPublicKey.every((val, index) => val === publicKey[index]);
		const secretKeyStructureValid =
			secretKey.length === 64 &&
			privateKey.every((val, index) => val === secretKey[index]) &&
			publicKey.every((val, index) => val === secretKey[index + 32]);
		return publicKeyMatches && secretKeyStructureValid;
	} catch (e) {
		console.error("[Worker] Validation error:", e);
		return false;
	}
}

self.onmessage = async (event: MessageEvent<{ suffix: string }>) => {
	const { suffix } = event.data;

	if (!suffix || typeof suffix !== "string" || suffix.trim() === "") {
		self.postMessage({ type: "error", success: false, error: "Invalid or missing suffix" });
		return;
	}

	let attempts = 0;
	const targetSuffix = suffix;

	try {
		while (true) {
			const privateKey = ed.utils.randomPrivateKey();
			const publicKey = await ed.getPublicKey(privateKey);
			const publicKeyBs58 = bs58.default.encode(publicKey);

			attempts++;

			if (publicKeyBs58.endsWith(targetSuffix)) {
				const secretKey = new Uint8Array(64);
				secretKey.set(privateKey, 0);
				secretKey.set(publicKey, 32);

				if (validateKeypair(privateKey, publicKey, secretKey)) {
					self.postMessage({
						type: "done",
						success: true,
						address: publicKeyBs58,
						keypair: {
							publicKey: Array.from(publicKey),
							privateKey: Array.from(privateKey),
						},
						attempts,
					});
					return;
				}

				console.warn(`[Worker] Key ${publicKeyBs58} matched suffix but failed validation. Continuing...`);
			}

			if (attempts % REPORT_INTERVAL === 0) {
				self.postMessage({
					type: "progress",
					keypair: {
						publicKey: Array.from(publicKey),
						privateKey: Array.from(privateKey),
					},
					attempts,
				});
			}
		}
	} catch (error) {
		const err = error as { message?: string };
		console.error("[Worker] Error during address generation:", error);
		self.postMessage({ type: "error", success: false, error: err.message || "Unknown worker error" });
	}
};

console.log("[Worker] Initialized and ready for messages.");
