export type LaunchSiweMessageInput = {
	address: string;
	nonce: string;
	origin: string;
	now?: Date;
	chainId?: number;
};

export function buildLaunchSiweMessage({
	address,
	nonce,
	origin,
	now = new Date(),
	chainId = 56,
}: LaunchSiweMessageInput): string {
	const url = new URL(origin);
	const issuedAt = now.toISOString();
	const expirationTime = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

	return `${url.host} wants you to sign in with your Ethereum account:\n${address}\n\nsign to confirm launch. waifu.fun will use this wallet as creator for the launch transaction.\n\nURI: ${url.origin}/create/wizard\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expirationTime}`;
}
