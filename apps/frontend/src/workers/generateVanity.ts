/**
 * Web Worker stub for vanity address / CREATE2 salt generation on BSC.
 *
 * The parent thread sends { suffix: string } and expects back messages
 * with { type: "progress" | "done" | "error", keypair?, error?, success? }.
 *
 * TODO: Implement real CREATE2 salt brute-forcing that produces a contract
 * address ending in the requested suffix.  For now this generates a random
 * 32-byte salt and reports "done" immediately so the UI doesn't hang.
 */

self.onmessage = (event: MessageEvent<{ suffix: string }>) => {
	const { suffix } = event.data;

	try {
		// Generate a random 32-byte salt (placeholder for real vanity logic)
		const privateKey = new Uint8Array(32);
		crypto.getRandomValues(privateKey);

		// Simulate a very fast "found" result
		const publicKey = new Uint8Array(32);
		crypto.getRandomValues(publicKey);

		// Report the result back
		self.postMessage({
			type: "done",
			keypair: {
				privateKey,
				publicKey,
			},
			success: true,
		});
	} catch (error) {
		self.postMessage({
			type: "error",
			error: error instanceof Error ? error.message : "Unknown error during vanity generation",
			success: false,
		});
	}
};
