type PolicySection = {
	header?: string;
	subheader?: string;
	content: string | string[];
	subcontent?: string[];
};

function getPolicySectionKey(item: PolicySection) {
	const contentKey = typeof item.content === "string" ? item.content : item.content.join("|");
	return [item.header, item.subheader, contentKey].filter(Boolean).join("|");
}

const LAST_MODIFIED = "April 20, 2026";

/**
 * waifu.fun privacy policy.
 *
 * waifu.fun is an open-source, non-custodial token launchpad for AI
 * agents on BNB Smart Chain. We do not hold user funds, we do not
 * custody private keys, and we do not operate as a money transmitter,
 * broker-dealer, or investment adviser. This policy describes the
 * limited data we collect and how we use it.
 *
 * This document is NOT legal advice. waifu.fun is a community project
 * provided on an "as is" basis.
 */
const PRIVACY_POLICY: PolicySection[] = [
	{
		header: "Overview",
		content:
			'This policy describes how the waifu.fun project ("waifu.fun", "we", "us") collects, uses, and handles information when you visit waifu.fun or interact with the smart contracts, APIs, and interfaces we publish. waifu.fun is an open-source, non-custodial launchpad for tokens associated with AI agents on BNB Smart Chain. We do not custody funds, we do not operate a brokerage, and we are not affiliated with, endorsed by, or officially connected to any exchange, foundation, or venture firm.',
	},
	{
		content:
			"waifu.fun is provided as-is for informational and technical purposes. Nothing on the platform is financial, legal, tax, or investment advice. By using waifu.fun you accept this policy; if you do not accept it, do not use the site.",
	},
	{
		header: "What we collect",
		subheader: "Information you give us directly",
		content:
			"Most of waifu.fun works with no account. Some flows (like claiming an agent) involve optional sign-in via X (Twitter). When you use these flows we receive:",
		subcontent: [
			"Your X handle, numeric X user id, display name, and public profile image",
			"Any wallet address you connect through your browser wallet",
			"Optional fields you type into the claim form (agent name, ticker, bio, image URL, social URLs, tax config)",
			"Messages you send us through support channels, if any",
		],
	},
	{
		subheader: "Information collected automatically",
		content:
			"Like most websites we receive some technical metadata when you load a page or call our APIs. This is used to keep the service running, debug issues, and aggregate non-identifying usage patterns.",
		subcontent: [
			"IP address, user agent, browser and device type",
			"Pages you visit on waifu.fun and the referring URL",
			"Approximate region derived from IP",
			"Error and performance telemetry from our edge/servers",
			"Analytics events (e.g. Vercel Analytics) recording pageviews without personal identifiers",
		],
	},
	{
		subheader: "On-chain data",
		content:
			"waifu.fun interacts with public smart contracts on BNB Smart Chain (including Four.Meme and PancakeSwap). All transactions you sign are written to a public blockchain. We do not control that data, we do not store private keys, and we cannot delete or alter on-chain history. When we display market data, trading pairs, or token statistics, that data is fetched from public on-chain sources or third-party indexers.",
	},
	{
		header: "How we use information",
		content: "We use the information above to:",
		subcontent: [
			"Operate the site, process claim flows, and show you your connected agents",
			"Attribute claims to X accounts so the same link cannot be hijacked by a different user",
			"Debug, monitor, and improve the platform",
			"Detect abuse such as spam, bots, or attempts to manipulate the claim flow",
			"Comply with applicable laws or respond to valid legal process",
		],
	},
	{
		content:
			"We do not sell your personal information. We do not use your X profile, wallet address, or on-chain activity for advertising. We do not build personal profiles for resale.",
	},
	{
		header: "Cookies and local storage",
		content:
			"waifu.fun uses first-party HTTP-only cookies for session management (for example, a short-lived OAuth state cookie and a patron session cookie after you sign in with X). We use local storage only to remember low-sensitivity UI preferences such as which wallet you last connected. You can clear these at any time via your browser.",
	},
	{
		header: "Third parties we rely on",
		content:
			"waifu.fun integrates with services that process some data on our behalf or on yours. By using the relevant feature you also accept the privacy policy of that provider.",
		subcontent: [
			"Four.Meme — the on-chain token launch protocol we integrate with",
			"PancakeSwap — the DEX where graduated tokens trade",
			"X (formerly Twitter) — OAuth provider for the claim flow",
			"Steward — wallet/identity and transaction signing infrastructure used during the prepare step",
			"Vercel — hosting, edge, and analytics",
			"Railway — backend API hosting",
			"RPC and indexing providers on BNB Smart Chain",
			"DexScreener and similar market data providers, used only to embed public chart iframes",
		],
	},
	{
		header: "Data retention",
		content:
			"We keep application data (claim tokens, prelaunch artifacts, patron sessions, logs) only for as long as needed to operate the service. Claim tokens expire by default within 48 hours. Session cookies expire automatically. Server logs are rotated on a short schedule. On-chain transactions cannot be deleted — they are part of the public blockchain record.",
	},
	{
		header: "Your choices",
		content: "You always have the following choices:",
		subcontent: [
			"Don't sign in with X — most of the site works without it; you just won't be able to claim an agent",
			"Disconnect your wallet any time from your browser wallet extension",
			"Sign out from X via the user menu to invalidate your patron session",
			"Clear your cookies and local storage from your browser settings",
			"Contact us at the address below to request deletion of non-on-chain data tied to your account",
		],
	},
	{
		header: "Security",
		content:
			"We take reasonable technical measures to protect the information we hold, including HTTPS everywhere, short-lived session tokens, hashed claim tokens, and isolated deployment environments. No online system is perfectly secure; you are responsible for keeping your wallet, recovery phrase, and X credentials safe. waifu.fun will never ask you for a seed phrase or private key.",
	},
	{
		header: "Children",
		content:
			"waifu.fun is not directed to anyone under 18 and we do not knowingly collect information from anyone under 18. If you are under 18, do not use the platform.",
	},
	{
		header: "International users",
		content:
			"waifu.fun is accessible globally. If you access the site from outside your local jurisdiction, you understand that information may be processed in regions whose data-protection regimes differ from yours. If you are in a jurisdiction that restricts or prohibits trading of digital assets, smart-contract-based tokens, or speculative instruments, it is your responsibility not to use waifu.fun.",
	},
	{
		header: "Updates",
		content:
			'We may update this policy from time to time. The "last modified" date at the top reflects the most recent revision. Continued use of waifu.fun after changes are posted means you accept the updated policy.',
	},
	{
		header: "Contact",
		content:
			"Questions, deletion requests, or feedback can be sent to hello@waifu.fun or raised as an issue on the project's GitHub organization at github.com/waifufun.",
	},
];

const PrivacyPolicy = () => {
	return (
		<div className="flex flex-col flex-1 min-h-[100dvh]">
			<div className="w-full max-w-5xl mx-auto px-4 py-12">
				<div className="mb-10">
					<h1 className="text-2xl font-bold text-[#00ff87] tracking-tight">Privacy Policy</h1>
					<p className="text-lg font-medium text-[#a1a1aa] mt-2">Last modified {LAST_MODIFIED}</p>
				</div>

				<div className="space-y-6">
					{PRIVACY_POLICY.map((item) => (
						<div
							key={getPolicySectionKey(item)}
							className={
								item.header ? "bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6" : ""
							}
						>
							{item.header && <h2 className="text-xl font-semibold text-[#00ff87] mb-4">{item.header}</h2>}
							{item.subheader && <h3 className="text-base font-medium text-[#a1a1aa] mb-3">{item.subheader}</h3>}
							<div className="text-sm text-[#a1a1aa] leading-relaxed">
								{typeof item.content === "string" ? (
									item.content
								) : (
									<ul className="list-disc list-inside space-y-2">
										{item.content.map((line) => (
											<li key={`${getPolicySectionKey(item)}-${line}`} className="text-[#a1a1aa]">
												{line}
											</li>
										))}
									</ul>
								)}
							</div>
							{item.subcontent && (
								<ul className="list-disc list-inside space-y-1 mt-3">
									{item.subcontent.map((line) => (
										<li key={`${getPolicySectionKey(item)}-sub-${line}`} className="text-sm text-[#a1a1aa]">
											{line}
										</li>
									))}
								</ul>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default PrivacyPolicy;
