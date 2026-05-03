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
 * waifu.fun is an open-source, non-custodial launchpad for AI agents
 * on BNB Smart Chain. The Platform is maintained by independent
 * open-source contributors and no legal entity is held out as the
 * operator. The Platform is not available to Restricted Persons,
 * including United States persons. This document is not legal advice.
 */
const PRIVACY_POLICY: PolicySection[] = [
	{
		header: "Overview",
		content:
			'This Privacy Policy describes how the independent open-source contributors who maintain the software published at github.com/waifufun (collectively, "the Project", "we", "us") collect, use, and handle information when you visit waifu.fun or interact with the smart contracts, APIs, and interfaces we publish. The Platform is an open-source, non-custodial toolchain for AI agents to prepare token launches on BNB Smart Chain and for eligible patrons to claim and broadcast them. No natural person or legal entity is held out as the operator. We do not custody funds, do not operate a brokerage, exchange, or money-services business, and are not affiliated with any foundation, exchange, or venture firm.',
	},
	{
		content:
			"The Platform is not available to Restricted Persons as defined in the Terms of Service, including residents and citizens of the United States of America, persons located in or entities formed in comprehensively sanctioned jurisdictions, and persons on any applicable sanctions or denied-parties list. If you are a Restricted Person, do not use the Platform.",
	},
	{
		content:
			"The Platform is provided as-is for informational and technical purposes. Nothing on the Platform is financial, legal, tax, or investment advice. By using the Platform you accept this Policy; if you do not accept it, do not use the site.",
	},
	{
		header: "What we collect",
		subheader: "Information you give us directly",
		content:
			"Most of the Platform works without an account. Some flows, such as claiming an agent, involve optional sign-in via X (formerly Twitter). When you use these flows we receive:",
		subcontent: [
			"Your X handle, numeric X user id, display name, and public profile image",
			"Any wallet address you connect through your browser wallet",
			"Optional fields you type into the claim form (agent name, ticker, bio, image URL, social URLs, tax configuration)",
			"Messages you send us through public channels such as GitHub issues",
		],
	},
	{
		subheader: "Information collected automatically",
		content:
			"Like most websites we receive some technical metadata when you load a page or call our APIs. This is used to keep the service running, debug issues, block abuse, and aggregate non-identifying usage patterns.",
		subcontent: [
			"IP address, user agent, browser and device type",
			"Pages you visit on the Platform and the referring URL",
			"Approximate region derived from IP, used to enforce geographic restrictions",
			"Error and performance telemetry from our edge and server infrastructure",
			"Aggregated analytics events recording pageviews without personal identifiers",
		],
	},
	{
		subheader: "On-chain data",
		content:
			"The Platform interacts with public smart contracts on BNB Smart Chain, including Four.Meme and PancakeSwap. All transactions you sign are written to a public blockchain. We do not control that data, do not store private keys, and cannot delete or alter on-chain history. When the Platform displays market data, trading pairs, or token statistics, that data is fetched from public on-chain sources or external indexers.",
	},
	{
		header: "How we use information",
		content: "We use the information above to:",
		subcontent: [
			"Operate the Platform, process claim flows, and show you your connected agents",
			"Attribute claims to X accounts so the same link cannot be hijacked by a different user",
			"Debug, monitor, and improve the Platform",
			"Detect and prevent abuse such as spam, bots, or attempts to manipulate the claim flow",
			"Enforce the Restricted Territories clause of the Terms of Service",
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
			"The Platform uses first-party HTTP-only cookies for session management (for example, a short-lived OAuth state cookie and a patron session cookie after you sign in with X). Local storage is used only to remember low-sensitivity UI preferences such as which wallet you last connected. You can clear these at any time via your browser.",
	},
	{
		header: "Third parties we rely on",
		content:
			"The Platform integrates with services that process some data on our behalf or on yours. By using the relevant feature you also accept the privacy policy of that provider. Data handled by these services is subject to their own policies.",
		subcontent: [
			"Four.Meme: the on-chain token launch protocol we integrate with",
			"PancakeSwap: the decentralized exchange where graduated tokens trade",
			"X (formerly Twitter): OAuth provider for the claim flow",
			"Steward: wallet and identity infrastructure used during the prepare step",
			"Cloudflare: edge hosting and CDN for the web application",
			"Railway: backend API hosting",
			"RPC and indexing providers on BNB Smart Chain",
			"DexScreener and similar market-data providers, used to embed public chart iframes",
		],
	},
	{
		header: "Data retention",
		content:
			"We keep application data (claim tokens, prelaunch artifacts, patron sessions, logs) only for as long as needed to operate the Platform. Claim tokens expire by default within 48 hours. Session cookies expire automatically. Server logs are rotated on a short schedule. On-chain transactions cannot be deleted: they are part of the public blockchain record.",
	},
	{
		header: "Your choices",
		content: "You always have the following choices:",
		subcontent: [
			"Don't sign in with X. Most of the Platform works without it; you just cannot claim an agent",
			"Disconnect your wallet at any time from your browser wallet extension",
			"Sign out from X via the user menu to invalidate your patron session",
			"Clear your cookies and local storage from your browser settings",
			"Request deletion of non-on-chain data tied to your account by opening an issue on our GitHub organization at github.com/waifufun",
		],
	},
	{
		header: "Security",
		content:
			"We take reasonable technical measures to protect the information we hold, including HTTPS everywhere, short-lived session tokens, hashed claim tokens, and isolated deployment environments. No online system is perfectly secure; you are responsible for keeping your wallet, recovery phrase, and X credentials safe. The Project will never ask you for a seed phrase or private key.",
	},
	{
		header: "Children",
		content:
			"The Platform is not directed to anyone under 18 and we do not knowingly collect information from anyone under 18. If you are under 18, do not use the Platform.",
	},
	{
		header: "International users and cross-border data",
		content:
			"The Platform is accessible from many regions but is not targeted at, and not available to, residents or citizens of the United States or persons located in comprehensively sanctioned jurisdictions. If you access the Platform from outside your local jurisdiction, you understand that information may be processed in regions whose data-protection regimes differ from yours. If your jurisdiction restricts or prohibits trading of digital assets or smart-contract-based tokens, it is your responsibility not to use the Platform.",
	},
	{
		header: "Updates",
		content:
			'We may update this Policy from time to time. The "last modified" date at the top reflects the most recent revision. Continued use of the Platform after changes are posted means you accept the updated Policy.',
	},
	{
		header: "Contact",
		content:
			"Questions, deletion requests, or feedback can be raised as an issue on the project's GitHub organization at github.com/waifufun.",
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
