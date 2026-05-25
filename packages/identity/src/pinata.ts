const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,}|bafk[a-z2-7]{20,})$/;

type PinataResponse = {
	IpfsHash?: string;
	cid?: string;
	Hash?: string;
};

export class PinataPinningError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PinataPinningError";
	}
}

export function isValidIpfsCid(cid: string): boolean {
	return CID_RE.test(cid);
}

function pinataAuthHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
	const jwt = env.PINATA_JWT;
	if (jwt && jwt.trim().length > 0) return { Authorization: `Bearer ${jwt.trim()}` };
	const apiKey = env.PINATA_API_KEY;
	const apiSecret = env.PINATA_API_SECRET;
	if (apiKey && apiSecret) {
		return {
			pinata_api_key: apiKey,
			pinata_secret_api_key: apiSecret,
		};
	}
	throw new PinataPinningError("PINATA_JWT or PINATA_API_KEY/PINATA_API_SECRET is required");
}

export async function pinRegistrationFile(
	json: object,
	options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; name?: string } = {},
): Promise<string> {
	const env = options.env ?? process.env;
	const fetchImpl = options.fetchImpl ?? fetch;
	const response = await fetchImpl("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...pinataAuthHeaders(env),
		},
		body: JSON.stringify({
			pinataMetadata: { name: options.name ?? "erc8004-registration.json" },
			pinataContent: json,
		}),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new PinataPinningError(`Pinata pin failed: ${response.status} ${text}`.trim());
	}
	const data = (await response.json()) as PinataResponse;
	const cid = data.IpfsHash ?? data.cid ?? data.Hash;
	if (!cid || !isValidIpfsCid(cid)) throw new PinataPinningError("Pinata response did not include a valid CID");
	return `ipfs://${cid}`;
}
